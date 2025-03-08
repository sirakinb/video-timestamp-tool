# Smart Video Timestamp Generator

A modern web application for generating SEO-friendly timestamps for long-form videos. This tool helps content creators and viewers by identifying and marking key moments in videos, making content more accessible and discoverable.

## Features

- Modern dark interface
- Drag and drop video upload
- Support for videos from 8 to 120 minutes
- Smart timestamp generation for key moments
- SEO-friendly timestamp formatting
- Customizable timestamp categories
- Export timestamps in various formats (YouTube, blog posts, etc.)
- Real-time timestamp preview

## Key Benefits

- Improved video navigation for viewers
- Better SEO ranking through structured timestamps
- Enhanced content discoverability
- Time-saving for content creators
- Increased viewer engagement

## Prerequisites

- Node.js 16+ and npm
- AWS Account with S3 bucket
- AI service API key (for smart timestamp detection)

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
AI_SERVICE_API_KEY=your_api_key
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

1. Upload your video file (8-120 minutes long)
2. Configure timestamp preferences:
   - Minimum time between timestamps
   - Categories of interest (topics, sections, highlights)
   - Custom markers
3. Generate timestamps
4. Review and edit generated timestamps
5. Export in your preferred format

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
- AI-powered timestamp detection
- Real-time preview capabilities

## Timestamp Categories

The tool automatically identifies and categorizes timestamps for:
- Topic changes
- Key arguments or points
- Demonstrations or examples
- Q&A sections
- Conclusions
- Notable quotes
- Technical demonstrations
- Product reviews/comparisons
- Tutorial steps

## Export Formats

Timestamps can be exported in various formats:
- YouTube description format
- Markdown for blog posts
- JSON for API integration
- Plain text with customizable formatting
- HTML with clickable links 