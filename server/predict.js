import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// Endpoint that calls the Python prediction script
app.post('/api/predict', (req, res) => {
  // You can pass optional hashrate, but we'll use the latest data from DB
  const { hashrate } = req.body;

  const pythonProcess = spawn('python', [
    path.join(__dirname, '../scripts/predict.py'),
    hashrate ? hashrate.toString() : ''
  ]);

  let result = '';
  pythonProcess.stdout.on('data', (data) => {
    result += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error('Python error:', data.toString());
  });

  pythonProcess.on('close', (code) => {
    if (code === 0) {
      try {
        const prediction = JSON.parse(result);
        res.json(prediction);
      } catch (e) {
        res.status(500).json({ error: 'Invalid prediction output' });
      }
    } else {
      res.status(500).json({ error: 'Prediction failed' });
    }
  });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`🔮 Prediction API running on port ${PORT}`));