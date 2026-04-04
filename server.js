const express = require("express");
const path = require("path");
const app = express();
const PORT = 3001;

const config = {
  supabaseUrl: "https://addghapkcuhowzxkmtdh.supabase.co",
  supabaseKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkZGdoYXBrY3Vob3d6eGttdGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzcyOTYsImV4cCI6MjA5MDM1MzI5Nn0._fpsJ7DRlM6uv9ZEuUSQ8mgouVBoHgX_AmHJ-4aKhWw",
};

// Disable Caching to force the new design to show
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});

app.get("/config", (req, res) => res.json(config));

app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use(express.static(__dirname));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Vaultis Master Server: http://localhost:${PORT}`);
});
