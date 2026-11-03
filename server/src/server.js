import cors from "cors";
import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    message: "Node server is running."
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
