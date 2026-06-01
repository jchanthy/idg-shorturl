import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  projectId: "reandigital-1716886354129"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const querySnapshot = await getDocs(collection(db, "links"));
  console.log("Documents found:", querySnapshot.size);
  querySnapshot.forEach((doc) => {
    console.log(`${doc.id} => ${doc.data().alias}`);
  });
}
run();
