const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const multer = require("multer");
const uniqueValidator = require("mongoose-unique-validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const checkAuth = require("./middleware/check-auth");

const app = express();

const MIME_TYPE_MAP = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg'
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const isValid = MIME_TYPE_MAP[file.mimetype];
        let error = new Error('Invalid mime type');
        if (isValid) {
            error = null;
        }
        cb(error, "images")
    },
    filename: (req, file, cb) => {
        const name = file.originalname.toLowerCase().split(' ').join('-');
        const ext = MIME_TYPE_MAP[file.mimetype];
        cb(null, name + '-' + Date.now() + '.' + ext);
    }
});

mongoose.connect("mongodb+srv://anand:unicornb1331@cluster0-0tquo.mongodb.net/crowdFundingDB", {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useCreateIndex: true
    })
    .then(() => {
        console.log("Connected to DataBase");
    })
    .catch(() => {
        console.log("Connection Failed!!!");
    });

//mongo "mongodb+srv://cluster0-0tquo.mongodb.net/test" --username anand

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use("/images", express.static(path.join("images")));

// For CORS,Pgm Line no 12 to 29
app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'https://crowdfundingangular.herokuapp.com');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});

///////Project Collection////////////////////////

const projectSchema = mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    imagePath: {
        type: String,
        required: true
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "usercollections", 
        required: true
    }
});

var projectCollection = mongoose.model("projectcollections", projectSchema);

//////////User Collection///////////////////////////

const userSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    }
});

userSchema.plugin(uniqueValidator);

var userCollection = mongoose.model("usercollections", userSchema);


////// Project API ///////////////
app.get("/getProject", (req, res) => {
    const pageSize = +req.query.pagesize;
    const currentPage = +req.query.page;
    const postQuery = projectCollection.find().sort({_id:-1});
    let fetchedPosts;

    if (pageSize && currentPage) {
        postQuery
            .skip(pageSize * (currentPage - 1))
            .limit(pageSize);
    }
    postQuery
        .then(documents => {
            fetchedPosts = documents;
            return projectCollection.countDocuments();
        })
        .then(count => {
            res.status(200).json({
                message: "Project fetched Successfully",
                posts: fetchedPosts,
                maxPosts: count
            });
        })
        .catch(erro => {
            res.status(500).json({
                message: "Fetching Projects Failed!"
            })
        });
});

app.post("/postProject", checkAuth, multer({
    storage: storage
}).single("image"), (req, res) => {
    const url = req.protocol + "://" + req.get("host");
    const project = new projectCollection({
        title: req.body.title,
        content: req.body.content,
        imagePath: url + "/images/" + req.file.filename,
        creator: req.userData.userId
    });

    project.save().then(createdPost => {
        res.status(201).json({
            message: "Project Added Successfully!",
            post: {
                id: createdPost._id,
                title: createdPost.title,
                content: createdPost.content,
                imagePath: createdPost.imagePath
            }
        });

    })
    .catch(error => {
        res.status(500).json({
            message: "Creating a Projects Failed!"
        })
    });
});

app.put("/updateProject/:id",checkAuth, multer({
    storage: storage
}).single("image"), (req, res) => {
    let imagePath = req.body.imagePath;
    if (req.file) {
        const url = req.protocol + "://" + req.get("host");
        imagePath = url + "/images/" + req.file.filename;
    }
    projectCollection.updateOne({
        _id: req.params.id, creator: req.userData.userId
    }, {
        _id: req.body.id,
        title: req.body.title,
        content: req.body.content,
        imagePath: imagePath,
        creator: req.userData.userId
    }).then(result => {
       if (result.n > 0) {
           res.status(200).json({message: "Update successfull!"});
       } else {
           res.status(401).json({message: "Not Authorized!"});
       }
    })
    .catch(error => {
        res.status(500).json({
            message: "Couldn't Update Project!"
        });
    });
})

app.get("/updateProject/:id", (req, res) => {
    projectCollection.findById(req.params.id).then(post => {
        if (post) {
            res.status(200).json(post);
        } else {
            res.status(401).json({
                message: "Project not Found!"
            });
        }
    })
    .catch(error => {
        res.status(500).json({
            message: "Fetching Project Failed!"
        })
    })
})

app.delete("/deleteProject/:id", checkAuth, (req, res) => {
    projectCollection.deleteOne({
        _id: req.params.id, creator: req.userData.userId
    }).then(result => {
        if (result.n > 0) {
            res.status(200).json({message: "Deletion successfull!"});
        } else {
            res.status(401).json({message: "Not Authorized!"});
        }
    })
    .catch(error => {
        res.status(500).json({
            message: "Deletion Failed!"
        })
    });
})


////User API/////////////////////////////////////////////////////////////////////////////////////////////
app.post("/signup", (req, res) => {
    bcrypt.hash(req.body.password, 10)
        .then(hash => {
            const user = new userCollection({
                name: req.body.name,
                email: req.body.email,
                password: hash
            });
            user.save()
                .then(result => {
                    res.status(201).json({
                        message: "User Created!",
                        result: result
                    })
                })
                .catch(err => {
                    res.status(500).json({
                      message: "Invalid authentication credentials!" 
                    });
                });
        });
})

app.post("/login",(req,res) => {
    let fetchedUser;
    userCollection.findOne({email: req.body.email})
    .then(user => {
        if (!user) {
            return res.status(401).json({
                message: "Auth Failed"
            })
        }
        fetchedUser = user;
        return bcrypt.compare(req.body.password, user.password);
    })
    .then(result => {
        if (!result) {
            return res.status(401).json({
                message: "Auth Failed !"
            });
        }
        const token = jwt.sign({
            userId: fetchedUser._id, email: fetchedUser.email}, 
            'secret_this_should_be_longer', 
            { expiresIn: "1h"}
            );
            res.status(200).json({
                token: token,
                expiresIn: 3600,
                userId: fetchedUser._id
            });
    })
    .catch(err => {
        console.log(err);
        return res.status(401).json({
            message: "Invalid Authentication Credentials!"
        })
    })
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get("/", (req, res) => {
    res.send("CrowdFunding App Starter");
})

app.listen(process.env.PORT || 3000, () => {
    console.log("Server is Up and listening @PORT 3000");
})