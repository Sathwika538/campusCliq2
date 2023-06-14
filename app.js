const express = require("express");
const multer = require("multer");
const bodyparser = require("body-parser");
const encoder = bodyparser.urlencoded({extended:true});
const dotenv = require("dotenv");
const app=express();
const path = require("path");
const cookieParser = require("cookie-parser");
const ErrorHandler = require("./utils/ErrorHandler");
const catchAsyncErrors = require("./middleware/catchAsyncErrors");
const {isAuthenticatedUser} = require("./middleware/auth");
const {logout} = require("./controllers/userController");
const sendToken = require("./utils/jwtToken");
const fs = require("fs");
const uploadsDir = path.join("./public/uploads");
const uploadsDir2 = path.join(__dirname, "uploads_blogs");
const sharp = require("sharp");
const dateTime = require("simple-datetime-formater");   
const cloudinary = require('cloudinary').v2;
const {Octokit} = require("@octokit/rest");
const flash = require('connect-flash');
const session = require('express-session');

// Express sessions
app.use(session({ secret: 'yoursecret', resave: true,  saveUninitialized: true }));

// Connect flash
app.use(flash());
app.use(express.json());
app.use(cookieParser());
app.use(bodyparser.urlencoded({extended:true}));
app.use(express.static('public'));
app.use(function(request, response, next) {
  response.locals.success_alert_message = request.flash('success_alert_message');
  response.locals.error_message = request.flash('error_message');
  response.locals.error = request.flash('error');
  next();
});


const user = require('./routes/userRoute');
const Post = require("./models/postModel");
const User = require("./models/userModel");
app.set('view engine', 'ejs')
//Config       
if(process.env.NODE_ENV !== "PRODUCTION"){
    require("dotenv").config({path:"config/config.env"});
} 
app.use('/api/v1',user);
//database connection
const connect = require("./database");
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:process.env.CLOUDINARY_API_KEY,
  api_secret:process.env.CLOUDINARY_API_SECRET,
})

const mongoose = require('mongoose');

// configure multer middleware
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const folder = req.params.folder;
      const subfolder = req.params.subfolder;
      cb(null, `./public/uploads/${folder}/${subfolder}`);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + encodeURIComponent(file.originalname));
    },
  });

const storage2 = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads_blogs/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }


    // destination: function (req, file, cb) {
    //   cb(null, 'uploads_blogs/');
    // },
    
    // filename: function (req, file, cb) {
    //   cb(null, file.originalname);
    // }
  });

  const upload2 = multer({
    storage: storage2, 
     
  });
  const upload = multer({
    storage: storage, 
   
  });

  const octokit = new Octokit({
    auth: process.env.GITHUB_ACCESS_TOKEN,
  });
  
 

  app.get(`/download/:folder/:subfolder/:filename`,isAuthenticatedUser,async (req, res) => {
    const {folder,subfolder, filename } = req.params;
    // const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-';
    // const suffixedFileName = uniqueSuffix + filename;
    //console.log(suffixedFileName);
    const fileUrl = `https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO_NAME}/raw/main/${folder}/${subfolder}/${filename}`;
      res.redirect(fileUrl);
    
  });
  
  app.get(`/notes/:folder/:subfolder`,isAuthenticatedUser, async (req, res)=> {
    const folder = req.params.folder;
    const subfolder = req.params.subfolder;
    const query = req.query.query; 
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    const path = `${folder}/${subfolder}` ;
    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });
      let files = response.data.filter(item => item.type === 'file');
    if (query) {
      files = files.filter(file => {
        const fileName = file.name.toLowerCase();
        const queryLowerCase = query.toLowerCase();
        for (let i = 0; i <= fileName.length - queryLowerCase.length; i++) {
          if (fileName.substr(i, queryLowerCase.length) === queryLowerCase) {
           
            return true;
          }
        }
        return false;
      });
    }
  files = files.filter(file => {
    const fileExtension = file.name.toLowerCase().split('.').pop();
    return fileExtension === 'pdf' || fileExtension === 'docx';
  });
    const encodedFiles = files.map(function(file) {
      let a = 0;
      let truncateFileName = "";
      for(var i = 0;i<file.name.length;i++){
        if(a === 2){
          truncateFileName = file.name.slice(i);
          break;
        }
        if(file.name[i] === '-') a ++;

      }
      return {
        filename: truncateFileName,
        originalname: file.name
        
      };
    });
    res.render(`semesters_notes/${folder}/${subfolder}`, { 
      files:encodedFiles
     });
     
    } catch (error) {
      console.error('Error retrieving files:', error);
      res.status(500).send('Failed to fetch files.');
    }

  });

  
  const getAllPosts = async (req, res, next) => {
    try {
      const posts = await Post.find().sort({ createdAt: -1 });
      res.locals.posts = posts;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).send('Error fetching posts');
    }
  };

app.use("/uploads", express.static(path.join("./public/uploads")));
app.use("/uploads_blogs", express.static(path.join(__dirname, "uploads_blogs")));


app.get("/",getAllPosts,async (req, res,next) => {
  const token = req.cookies.token;
  if(token){
    res.redirect('/home');
  }
  else{
    res.render("index");
  }
    
})

app.get('/home',getAllPosts,isAuthenticatedUser ,(req,res) => {
    res.render('home');
})
app.get("/gaming",isAuthenticatedUser,function(req,res){
  res.render("chat");
})
app.get("/profile",isAuthenticatedUser,function(req,res){
  const user = req.user;
  res.render("profile",{user});
})
app.get("/notes",isAuthenticatedUser,(req,res)=>{
  res.render("sem_notes");
})
app.get("/notes/sem1",isAuthenticatedUser,(req,res)=>{
  res.render("semesters_notes/sem1");
})
app.get("/notes/sem2",isAuthenticatedUser,(req,res)=>{
  res.render("semesters_notes/sem2");
})
app.get('/blogs',getAllPosts,isAuthenticatedUser, (req, res) => {
  res.render('blog');
});
app.get("/logout",logout);


app.post('/add',isAuthenticatedUser, upload2.single('image'),async (req, res) => {
  const title = req.body.title;
  const body = req.body.body;
  const namee = req.body.namee;
try{
  const myCloud = await cloudinary.uploader.upload(req.file.path, {
    folder:"postsPics",
    transformation: [
      { quality: "auto" },
      { fetch_format: "auto" },
      { flags: "lossy" }
    ],
    width:150,
    crop:"scale",
})
    const post = new Post({ 
      title : title, 
      body : body,
      image : {
        public_id:myCloud.public_id,
        url:myCloud.secure_url,
      },
      namee:namee,
    });
   await post.save()
      res.redirect('/blogs');
    
  
} catch(err){
  console.error(err);
  res.sendStatus(500);
}
  
});

app.post("/",getAllPosts,async (req,res,next) => {
  const enrollment_id = req.body.enrollment_id;
  const password = req.body.password;
  
  
  const user =await User.findOne({enrollment_id}).select("+password");

  if(!user){
    req.flash('error_message', 'Invalid Enrollment or Password')
     // return next(new ErrorHandler("Invalid Enrollment or Password",401));
   return res.redirect("/");
  }

  const isPasswordMatched =await user.comparePassword(password);

  if(!isPasswordMatched){
    req.flash('error_message', 'Invalid Enrollment or Password')
    //  return next(new ErrorHandler("Invalid Enrollment or Password",401));
   return res.redirect("/");

  }
  sendToken(user,201,res);
  res.render("home",{enrollment_id:enrollment_id,password:password});
})


app.post(`/upload/:folder/:subfolder`,isAuthenticatedUser, upload.single('fileToUpload'), async (req, res) => {
  const branch = 'main'; 

// Get the latest commit SHA for the branch
const { data: commitData } = await octokit.rest.repos.getBranch({
owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO_NAME,
branch: branch,
});

const latestCommitSHA = commitData.commit.sha;

  const { path, originalname } = req.file;
  const {folder,subfolder} = req.params;
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-';
  const suffixedFileName = uniqueSuffix + originalname;
  const fileContent = fs.readFileSync(path);

  const fileData = await octokit.rest.repos.createOrUpdateFileContents({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO_NAME,
    path: `${folder}/${subfolder}/${suffixedFileName}`,
    message: 'Add new file',
    content: Buffer.from(fileContent).toString('base64'),
    sha: latestCommitSHA,
  });

    // Delete the temporary file
    fs.unlinkSync(path);

  res.redirect(`/notes/${folder}/${subfolder}`);
});

module.exports = app