import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Configure CORS with specific options
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://funtimesvideo0217.vercel.app',
    'https://fun-times-video-transcription.vercel.app',
    'https://fun-times-video-transcription-git-main-sirakinbs-projects.vercel.app',
    /\.vercel\.app$/ // Allow all Vercel preview deployments
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'Host'],
  credentials: true
}));

app.use(express.json());

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

interface UploadUrlRequest {
  fileName: string;
  fileType: string;
}

// Generate pre-signed URL for upload
app.post('/api/getUploadUrl', async (req: Request<{}, {}, UploadUrlRequest>, res: Response) => {
  try {
    const { fileName, fileType } = req.body;
    console.log('Received upload URL request:', { fileName, fileType });
    
    if (!fileName || !fileType) {
      console.error('Missing required fields:', { fileName, fileType });
      return res.status(400).json({ error: 'fileName and fileType are required' });
    }

    const key = `uploads/${Date.now()}-${fileName}`;
    console.log('Generated S3 key:', key);

    const putCommand = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      ACL: 'private',
      ChecksumAlgorithm: 'CRC32',
      RequestPayer: 'requester'
    });

    console.log('Generating pre-signed URL with params:', {
      bucket: process.env.AWS_BUCKET_NAME,
      key,
      contentType: fileType
    });

    const uploadUrl = await getSignedUrl(s3Client, putCommand, { 
      expiresIn: 3600,
      signableHeaders: new Set(['host', 'content-type']),
      unsignableHeaders: new Set(['expect', 'accept'])
    });

    console.log('Generated pre-signed URL successfully');
    
    res.json({
      uploadUrl,
      key,
    });
  } catch (err: any) {
    console.error('Error generating upload URL:', {
      error: err,
      message: err?.message,
      stack: err?.stack
    });
    res.status(500).json({ 
      error: 'Failed to generate upload URL', 
      details: err?.message || 'Unknown error' 
    });
  }
});

interface TranscribeRequest {
  key: string;
}

// Initiate transcription
app.post('/api/transcribe', async (req: Request<{}, {}, TranscribeRequest>, res: Response) => {
  try {
    const { key } = req.body;
    
    // Get a signed URL for AssemblyAI to access the file
    const getCommand = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    });
    
    const fileUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

    // Initialize AssemblyAI
    const assemblyai = axios.create({
      baseURL: 'https://api.assemblyai.com/v2',
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        'content-type': 'application/json',
      },
    });

    // Submit the audio file for transcription
    const response = await assemblyai.post('/transcript', {
      audio_url: fileUrl,
      speaker_labels: true,
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error initiating transcription:', error);
    res.status(500).json({ error: 'Failed to initiate transcription' });
  }
});

interface TranscriptionParams {
  id: string;
}

// Check transcription status
app.get('/api/transcription/:id', async (req: Request<TranscriptionParams>, res: Response) => {
  try {
    const { id } = req.params;
    
    const assemblyai = axios.create({
      baseURL: 'https://api.assemblyai.com/v2',
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        'content-type': 'application/json',
      },
    });

    const response = await assemblyai.get(`/transcript/${id}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error checking transcription status:', error);
    res.status(500).json({ error: 'Failed to check transcription status' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 