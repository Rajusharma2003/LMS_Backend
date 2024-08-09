import path from "path";

import multer from "multer";

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 mb in size max limit
  storage: multer.diskStorage({
    destination: "uploads/",
    filename: (_req, file, cb) => {
      cb(null, file.originalname);
    },
  }),
  fileFilter: (_req, file, cb) => {
    let ext = path.extname(file.originalname);

    if (
      ext !== ".jpg" &&
      ext !== ".jpeg" &&
      ext !== ".webp" &&
      ext !== ".png" &&
      ext !== ".mp4"
    ) {
      cb(new Error(`Unsupported file type! ${ext}`), false);
      return;
    }

    cb(null, true);
  },
});

export default upload;





// import path from "path";
// import multer from "multer";

// // Define storage configuration
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/");
//   },
//   filename: (req, file, cb) => {
//     // Generate a unique filename to prevent collisions
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     const ext = path.extname(file.originalname);
//     cb(null, file.fieldname + '-' + uniqueSuffix + ext);
//   },
// });

// // Define file filter function
// const fileFilter = (req, file, cb) => {
//   const ext = path.extname(file.originalname);

//   if (![".jpg", ".jpeg", ".webp", ".png", ".mp4"].includes(ext)) {
//     cb(new Error(`Unsupported file type! ${ext}`), false);
//     return;
//   }

//   cb(null, true);
// };

// // Configure multer
// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max file size
//   fileFilter: fileFilter,
// });

// export default upload;

