# Video Transcription Tool

A modern web application for transcribing videos with speaker identification using AWS S3 and AssemblyAI.

## Features

- Modern dark interface
- Drag and drop video upload
- Support for files up to 4GB
- Chunked upload to AWS S3
- Speaker identification in transcription
- Real-time transcription status updates

## Prerequisites

- Node.js 16+ and npm
- AWS Account with S3 bucket
- AssemblyAI API key

## Setup

1. Clone the repository
2. Set up environment variables:

### Backend (.env)
```
PORT=3001
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_BUCKET_NAME=your_bucket_name
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
```

3. Install dependencies and start the servers:

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

4. Open http://localhost:3000 in your browser

## Usage

1. Drag and drop a video file or click to browse
2. Click "Start Transcription"
3. Wait for the transcription to complete
4. View the transcribed text with speaker identification

## AWS S3 Setup

1. Create an S3 bucket
2. Configure CORS for your bucket:
```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "POST", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

## Development

- Backend runs on http://localhost:3001
- Frontend runs on http://localhost:3000
- Uses TypeScript for type safety
- Tailwind CSS for styling 