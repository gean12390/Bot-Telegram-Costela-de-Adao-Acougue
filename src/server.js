import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/status", (req, res) => {
  res.json({
    online: true,
    message: "Sistema da loja funcionando!"
  });
});

app.listen(PORT, () => {
  console.log(`Loja rodando em http://localhost:${PORT}`);
});
