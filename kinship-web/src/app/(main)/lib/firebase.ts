import { initializeApp, getApps } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

export const init = () => {
  const apps = getApps();

  if (apps.length > 0) return;

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_MEASUREMENT_ID,
  };

  initializeApp(firebaseConfig);
};

export const uploadFile = async (
  file: File ,
  name: string,
  folder: string
): Promise<string> => {
  console.log(file, "upload file firebase called ===================>>");
  console.log("file.type>", file.type);

  const storage = getStorage();
  let extension = "png";
  console.log("file.type", file.type);
  if (file.type == "image/jpeg") {
    extension = "jpg";
  } else if (file.type == "image/png") {
    extension = "png";
  } else if (file.type == "image/gif") {
    extension = "gif";
  } else if (file.type == "application/pdf") {
    extension = "pdf";
  } else if (file.type == "application/msword") {
    extension = "doc";
  } else if (
    file.type ==
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    extension = "docx"; 
  }
  else if (file.type === "application/json") {
    console.log("json file detected");
  extension = "json";
}

  const storageRef = ref(
    storage,
    folder + `/${name}-${new Date().getTime()}.` + extension
  );

  await uploadBytes(storageRef, file);

  return await getDownloadURL(storageRef);
};
