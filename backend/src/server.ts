import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

dotenv.config();

// Add interfaces for AssemblyAI response types
interface Chapter {
  summary: string;
  headline: string;
  gist: string;
  start: number;
  end: number;
}

interface Highlight {
  timestamp: number;
  text: string;
  confidence: number;
}

interface Entity {
  entity_type: string;
  text: string;
  start: number;
  end: number;
}

interface Word {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface TranscriptResponse {
  id: string;
  status: string;
  chapters?: Chapter[];
  auto_highlights_result?: {
    results: Highlight[];
  };
  words?: Word[];
  entities?: Entity[];
  error?: string;
  iab_categories_result?: {
    summary: Record<string, number>;
  };
  content_safety_labels?: Record<string, any>;
}

interface Timestamp {
  time: number;
  formattedTime: string;
  title: string;
  category: string;
  confidence: number;
}

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize AssemblyAI client
const assemblyai = axios.create({
  baseURL: 'https://api.assemblyai.com/v2',
  headers: {
    authorization: process.env.ASSEMBLYAI_API_KEY,
    'content-type': 'application/json',
  },
});

// AWS S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Get pre-signed URL for video upload
app.post('/api/getUploadUrl', async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    
    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'fileName and fileType are required' });
    }

    const key = `videos/${uuidv4()}-${fileName}`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    res.json({ uploadUrl, key });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Analyze video and generate smart timestamps
app.post('/api/analyze-video', async (req, res) => {
  try {
    const { videoKey } = req.body;
    
    if (!videoKey) {
      return res.status(400).json({ error: 'videoKey is required' });
    }

    // Get video URL from S3
    const getCommand = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: videoKey,
    });

    const videoUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
    
    console.log('Submitting video for analysis:', videoUrl);
    
    // Submit to AssemblyAI for analysis
    const response = await assemblyai.post('/transcript', {
      audio_url: videoUrl,
      auto_chapters: true,
      auto_highlights: true,
      content_safety: true,
      entity_detection: true,
      iab_categories: true,
    });

    const transcriptId = response.data.id;
    console.log('Transcript ID:', transcriptId);

    // Poll for completion
    let transcript: TranscriptResponse;
    while (true) {
      const pollingResponse = await assemblyai.get(`/transcript/${transcriptId}`);
      transcript = pollingResponse.data;
      console.log('Transcript status:', transcript.status);

      if (transcript.status === 'completed') {
        break;
      } else if (transcript.status === 'error') {
        console.error('Transcript error:', transcript.error);
        throw new Error('Transcript processing failed');
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('Raw transcript data:', JSON.stringify(transcript, null, 2));

    // Process chapters and highlights into timestamps
    const timestamps = processTranscriptResponse(transcript);

    // Log the timestamps for debugging
    console.log('Processed timestamps:', JSON.stringify(timestamps, null, 2));

    // Return the timestamps directly
    res.json({ 
      timestamps: timestamps,
      categories: transcript.iab_categories_result?.summary || {},
      entities: transcript.entities || [],
      contentSafety: transcript.content_safety_labels || {},
    });
  } catch (error) {
    console.error('Error analyzing video:', error);
    res.status(500).json({ error: 'Failed to analyze video' });
  }
});

// Store timestamps for a video
app.post('/api/timestamps', async (req, res) => {
  try {
    const { videoKey, timestamps } = req.body;
    
    if (!videoKey || !timestamps) {
      return res.status(400).json({ error: 'videoKey and timestamps are required' });
    }

    // Store timestamps in S3
    const key = `timestamps/${videoKey}.json`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(timestamps),
      ContentType: 'application/json',
    });

    await s3Client.send(command);
    res.json({ success: true, key });
  } catch (error) {
    console.error('Error storing timestamps:', error);
    res.status(500).json({ error: 'Failed to store timestamps' });
  }
});

function processTranscriptResponse(transcript: TranscriptResponse): Timestamp[] {
  console.log("Processing transcript response");
  const timestamps: Timestamp[] = [];
  
  // Process chapters into timestamps - these are high-quality summaries from AssemblyAI
  if (transcript.chapters && transcript.chapters.length > 0) {
    for (const chapter of transcript.chapters) {
      const timeInSeconds = Math.floor(chapter.start / 1000);
      const title = chapter.headline || chapter.gist || chapter.summary || "";
      
      // Clean up the title - remove timestamp prefixes, filler words
      let cleanTitle = title
        .replace(/^\s*[0-9:]+\s*[-–]\s*/, '') // Remove any timestamp prefix
        .replace(/^(and|so|then|now|if|this|by)\s+/i, '') // Remove common filler words at start
        .replace(/\s+(um|uh|like|you know)\s+/g, ' ') // Remove filler words
        .trim();
        
      // Convert conversational phrases to direct action format
      cleanTitle = cleanTitle
        // Convert "I want to X" or "I would like to X" to just "X"
        .replace(/^I\s+(want|would like)\s+to\s+/i, '')
        // Convert "You can X" to "Using X" or "X"
        .replace(/^You\s+can\s+/i, '')
        // Convert questions like "Can you X" or "How do you X" to direct topics "X"
        .replace(/^(Can|Could|How\s+do|How\s+can|Do)\s+(you|I|we)\s+/i, '')
        // Convert "Let's X" or "Let me X" to just "X"
        .replace(/^Let(?:'s|s|\s+me|\s+us)\s+/i, '')
        .trim();
      
      // If the first word is a verb in present tense (not ending in -ing),
      // convert it to gerund form when appropriate
      const firstWord = cleanTitle.split(' ')[0].toLowerCase();
      if (
        // Common verbs that should be converted to gerund form
        ['use', 'build', 'create', 'deploy', 'host', 'get', 'make', 'setup', 'set', 'develop', 'implement', 'add', 'install', 'configure'].includes(firstWord) &&
        // Don't convert if it's already in a good format (like imperatives in tutorials)
        !cleanTitle.startsWith("How to") &&
        !cleanTitle.startsWith("Using") &&
        !cleanTitle.startsWith("Building") &&
        !cleanTitle.startsWith("Creating") &&
        !cleanTitle.startsWith("Getting") &&
        !cleanTitle.startsWith("Setting") &&
        !cleanTitle.startsWith("Developing") &&
        !cleanTitle.startsWith("Implementing") &&
        !cleanTitle.startsWith("Adding") &&
        !cleanTitle.startsWith("Installing") &&
        !cleanTitle.startsWith("Configuring")
      ) {
        // Convert verb to gerund form
        if (firstWord === 'use') {
          cleanTitle = 'Using' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'build') {
          cleanTitle = 'Building' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'create') {
          cleanTitle = 'Creating' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'deploy') {
          cleanTitle = 'Deploying' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'get') {
          cleanTitle = 'Getting' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'make') {
          cleanTitle = 'Making' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'set' || firstWord === 'setup') {
          cleanTitle = 'Setting up' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'develop') {
          cleanTitle = 'Developing' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'implement') {
          cleanTitle = 'Implementing' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'add') {
          cleanTitle = 'Adding' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'install') {
          cleanTitle = 'Installing' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'configure') {
          cleanTitle = 'Configuring' + cleanTitle.substring(firstWord.length);
        }
      }
        
      // Capitalize the first letter
      const formattedTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      
      timestamps.push({
        time: timeInSeconds,
        formattedTime: formatTime(timeInSeconds),
        title: formattedTitle,
        category: "Chapter",
        confidence: 0.95
      });
    }
  }

  // Process auto-highlights into timestamps if we don't have enough from chapters
  if (timestamps.length < 5 && transcript.auto_highlights_result?.results) {
    for (const highlight of transcript.auto_highlights_result.results) {
      const timeInSeconds = Math.floor(highlight.timestamp / 1000);
      
      // Clean up the title
      let cleanTitle = highlight.text
        .replace(/^\s*[0-9:]+\s*[-–]\s*/, '') // Remove any timestamp prefix
        .replace(/^(and|so|then|now|if|this|by)\s+/i, '') // Remove common filler words at start
        .replace(/\s+(um|uh|like|you know)\s+/g, ' ') // Remove filler words
        .trim();
        
      // Convert conversational phrases to direct action format (same processing as above)
      cleanTitle = cleanTitle
        // Convert "I want to X" or "I would like to X" to just "X"
        .replace(/^I\s+(want|would like)\s+to\s+/i, '')
        // Convert "You can X" to "Using X" or "X"
        .replace(/^You\s+can\s+/i, '')
        // Convert questions like "Can you X" or "How do you X" to direct topics "X"
        .replace(/^(Can|Could|How\s+do|How\s+can|Do)\s+(you|I|we)\s+/i, '')
        // Convert "Let's X" or "Let me X" to just "X"
        .replace(/^Let(?:'s|s|\s+me|\s+us)\s+/i, '')
        .trim();
      
      // If the first word is a verb in present tense (not ending in -ing),
      // convert it to gerund form when appropriate
      const firstWord = cleanTitle.split(' ')[0].toLowerCase();
      if (
        // Common verbs that should be converted to gerund form
        ['use', 'build', 'create', 'deploy', 'host', 'get', 'make', 'setup', 'set', 'develop', 'implement', 'add', 'install', 'configure'].includes(firstWord) &&
        // Don't convert if it's already in a good format
        !cleanTitle.startsWith("How to") &&
        !cleanTitle.startsWith("Using") &&
        !cleanTitle.startsWith("Building") &&
        !cleanTitle.startsWith("Creating") &&
        !cleanTitle.startsWith("Getting") &&
        !cleanTitle.startsWith("Setting") &&
        !cleanTitle.startsWith("Developing") &&
        !cleanTitle.startsWith("Implementing") &&
        !cleanTitle.startsWith("Adding") &&
        !cleanTitle.startsWith("Installing") &&
        !cleanTitle.startsWith("Configuring")
      ) {
        // Convert verb to gerund form (same mapping as above)
        if (firstWord === 'use') {
          cleanTitle = 'Using' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'build') {
          cleanTitle = 'Building' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'create') {
          cleanTitle = 'Creating' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'deploy') {
          cleanTitle = 'Deploying' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'get') {
          cleanTitle = 'Getting' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'make') {
          cleanTitle = 'Making' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'set' || firstWord === 'setup') {
          cleanTitle = 'Setting up' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'develop') {
          cleanTitle = 'Developing' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'implement') {
          cleanTitle = 'Implementing' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'add') {
          cleanTitle = 'Adding' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'install') {
          cleanTitle = 'Installing' + cleanTitle.substring(firstWord.length);
        } else if (firstWord === 'configure') {
          cleanTitle = 'Configuring' + cleanTitle.substring(firstWord.length);
        }
      }
        
      // Capitalize the first letter
      const formattedTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      
      timestamps.push({
        time: timeInSeconds,
        formattedTime: formatTime(timeInSeconds),
        title: formattedTitle,
        category: "Highlight",
        confidence: highlight.confidence
      });
    }
  }

  // Calculate video duration from latest word, chapter, or highlight
  let videoDuration = 0;
  
  if (transcript.words && transcript.words.length > 0) {
    const lastWord = transcript.words[transcript.words.length - 1];
    videoDuration = Math.max(videoDuration, lastWord.end / 1000);
  }
  
  if (transcript.chapters && transcript.chapters.length > 0) {
    const lastChapter = transcript.chapters[transcript.chapters.length - 1];
    videoDuration = Math.max(videoDuration, lastChapter.end / 1000);
  }
  
  if (transcript.auto_highlights_result?.results && transcript.auto_highlights_result.results.length > 0) {
    const timestamps = transcript.auto_highlights_result.results.map(h => h.timestamp / 1000);
    videoDuration = Math.max(videoDuration, ...timestamps);
  }
  
  // If no duration found or it's unreasonably short, default to 15 minutes
  if (videoDuration < 30) {
    videoDuration = 15 * 60;
  }

  // If we still don't have enough timestamps, generate some evenly distributed ones
  if (timestamps.length < 5) {
    // Create timestamps at roughly 0%, 25%, 50%, 75%, and 90% of the video
    const timePoints = [
      0,
      Math.floor(videoDuration * 0.25),
      Math.floor(videoDuration * 0.5),
      Math.floor(videoDuration * 0.75),
      Math.floor(videoDuration * 0.9)
    ];
    
    // For each time point, find the nearest word to create a meaningful title
    if (transcript.words && transcript.words.length > 0) {
      for (const timePoint of timePoints) {
        // Skip if we already have a timestamp close to this point
        if (timestamps.some(t => Math.abs(t.time - timePoint) < 30)) {
          continue;
        }
        
        // Find the nearest word to this time point
        const nearestWord = transcript.words.reduce((prev, curr) => {
          return Math.abs(curr.start / 1000 - timePoint) < Math.abs(prev.start / 1000 - timePoint) ? curr : prev;
        });
        
        // Get 10-15 words around this point to create a title
        const wordIndex = transcript.words.indexOf(nearestWord);
        const startIndex = Math.max(0, wordIndex - 5);
        const endIndex = Math.min(transcript.words.length - 1, wordIndex + 10);
        
        const titleWords = transcript.words.slice(startIndex, endIndex + 1);
        const title = titleWords.map(w => w.text).join(' ')
          .replace(/[.!?,;:].*$/, '') // Remove everything after the first sentence-ending punctuation
          .trim();
          
        // Apply the same conversational-to-direct transformations
        let cleanTitle = title
          // Convert "I want to X" or "I would like to X" to just "X"
          .replace(/^I\s+(want|would like)\s+to\s+/i, '')
          // Convert "You can X" to "Using X" or "X"
          .replace(/^You\s+can\s+/i, '')
          // Convert questions like "Can you X" or "How do you X" to direct topics "X"
          .replace(/^(Can|Could|How\s+do|How\s+can|Do)\s+(you|I|we)\s+/i, '')
          // Convert "Let's X" or "Let me X" to just "X"
          .replace(/^Let(?:'s|s|\s+me|\s+us)\s+/i, '')
          .trim();
        
        // Convert verbs to gerund form when appropriate
        const firstWord = cleanTitle.split(' ')[0].toLowerCase();
        if (
          // Common verbs that should be converted to gerund form
          ['use', 'build', 'create', 'deploy', 'host', 'get', 'make', 'setup', 'set', 'develop', 'implement', 'add', 'install', 'configure'].includes(firstWord) &&
          // Don't convert if it's already in a good format
          !cleanTitle.startsWith("How to") &&
          !cleanTitle.startsWith("Using") &&
          !cleanTitle.startsWith("Building") &&
          !cleanTitle.startsWith("Creating") &&
          !cleanTitle.startsWith("Getting") &&
          !cleanTitle.startsWith("Setting") &&
          !cleanTitle.startsWith("Developing") &&
          !cleanTitle.startsWith("Implementing") &&
          !cleanTitle.startsWith("Adding") &&
          !cleanTitle.startsWith("Installing") &&
          !cleanTitle.startsWith("Configuring")
        ) {
          // Convert verb to gerund form
          if (firstWord === 'use') {
            cleanTitle = 'Using' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'build') {
            cleanTitle = 'Building' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'create') {
            cleanTitle = 'Creating' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'deploy') {
            cleanTitle = 'Deploying' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'get') {
            cleanTitle = 'Getting' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'make') {
            cleanTitle = 'Making' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'set' || firstWord === 'setup') {
            cleanTitle = 'Setting up' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'develop') {
            cleanTitle = 'Developing' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'implement') {
            cleanTitle = 'Implementing' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'add') {
            cleanTitle = 'Adding' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'install') {
            cleanTitle = 'Installing' + cleanTitle.substring(firstWord.length);
          } else if (firstWord === 'configure') {
            cleanTitle = 'Configuring' + cleanTitle.substring(firstWord.length);
          }
        }
          
        // Capitalize the first letter
        const formattedTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
        
        timestamps.push({
          time: timePoint,
          formattedTime: formatTime(timePoint),
          title: formattedTitle,
          category: "Section",
          confidence: 0.85
        });
      }
    } else {
      // If we don't have words, just create generic timestamps
      for (let i = 0; i < timePoints.length; i++) {
        const timePoint = timePoints[i];
        
        // Skip if we already have a timestamp close to this point
        if (timestamps.some(t => Math.abs(t.time - timePoint) < 30)) {
          continue;
        }
        
        let title;
        if (i === 0) title = "Introduction to the project";
        else if (i === 1) title = "Setting up the environment";
        else if (i === 2) title = "Building core functionality";
        else if (i === 3) title = "Implementing advanced features";
        else title = "Finalizing and deploying";
        
        timestamps.push({
          time: timePoint,
          formattedTime: formatTime(timePoint),
          title: title,
          category: "Section",
          confidence: 0.8
        });
      }
    }
  }

  // Sort timestamps by time and remove duplicates/near duplicates
  return timestamps
    .sort((a, b) => a.time - b.time)
    .filter((timestamp, index, self) => {
      // Keep only timestamps that are at least 30 seconds apart
      return index === 0 || timestamp.time - self[index - 1].time >= 30;
    });
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 