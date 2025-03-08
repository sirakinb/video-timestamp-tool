'use client';

import React, { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

// Add API base URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [timestamps, setTimestamps] = useState([]);
  const [error, setError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestedTimestamps, setSuggestedTimestamps] = useState([]);
  const videoRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('video/')) {
      setFile(droppedFile);
    } else {
      setError('Please upload a valid video file');
    }
  }, []);

  const handleFileSelect = useCallback((e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type.startsWith('video/')) {
      setFile(selectedFile);
    } else {
      setError('Please upload a valid video file');
    }
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const removeTimestamp = (id) => {
    setTimestamps(prev => prev.filter(t => t.id !== id));
  };

  const exportTimestamps = (format) => {
    let output = '';
    
    switch (format) {
      case 'youtube':
        output = timestamps
          .map(t => `${t.formattedTime} ${t.title}`)
          .join('\n');
        break;
      case 'markdown':
        output = timestamps
          .map(t => `- [${t.formattedTime}](${t.time}) - ${t.title}`)
          .join('\n');
        break;
      case 'json':
        output = JSON.stringify(timestamps, null, 2);
        break;
      default:
        output = timestamps
          .map(t => `${t.formattedTime} - ${t.title}`)
          .join('\n');
    }

    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timestamps.${format === 'json' ? 'json' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const analyzeVideo = async () => {
    if (!file) return;

    try {
      setIsAnalyzing(true);
      setError(null);
      setProcessingStatus('Analyzing video content...');

      // First upload the video
      const { data: { uploadUrl, key } } = await axios.post(`${API_URL}/api/getUploadUrl`, {
        fileName: file.name,
        fileType: file.type,
      });

      await axios.put(uploadUrl, file, {
        headers: {
          'Content-Type': file.type,
        },
      });

      // Then analyze it
      const { data } = await axios.post(`${API_URL}/api/analyze-video`, {
        videoKey: key,
      });

      // Process the timestamps to ensure they have all required fields
      const processedTimestamps = data.timestamps.map(timestamp => ({
        id: Date.now() + Math.random(), // Ensure unique IDs
        time: timestamp.time || 0,
        formattedTime: timestamp.formattedTime || formatTime(timestamp.time || 0),
        title: timestamp.title || 'Untitled',
        category: timestamp.category || 'Key Point',
        confidence: timestamp.confidence || 0
      }));

      setSuggestedTimestamps(processedTimestamps);
      setProcessingStatus('Analysis complete! Review and edit suggested timestamps.');
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Failed to analyze video');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const acceptSuggestedTimestamp = (timestamp) => {
    setTimestamps(prev => [...prev, {
      ...timestamp,
      id: Date.now(),
    }].sort((a, b) => a.time - b.time));
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Smart Video Timestamp Generator</h1>
        
        {error && (
          <div className="bg-red-500 text-white p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        {!file ? (
          <div
            className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('file-input').click()}
          >
            <CloudArrowUpIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-xl mb-2">Drag and drop your video or click to browse</p>
            <p className="text-sm text-gray-400">Supports videos from 8 to 120 minutes</p>
            <input
              id="file-input"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-4">
              {/* Video thumbnail instead of player */}
              <div className="w-full rounded-lg bg-gray-700 p-4 text-center">
                <p className="text-lg mb-2">{file.name}</p>
                <p className="text-sm text-gray-400">Video uploaded and ready for analysis</p>
              </div>
              
              <div className="mt-4 flex items-center justify-end">
                <button
                  onClick={analyzeVideo}
                  disabled={isAnalyzing}
                  className={`px-4 py-2 rounded-lg flex items-center ${
                    isAnalyzing 
                      ? 'bg-gray-600 cursor-not-allowed' 
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {isAnalyzing ? (
                    <>
                      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Analyzing...
                    </>
                  ) : (
                    <>Analyze with AI</>
                  )}
                </button>
              </div>
            </div>

            {suggestedTimestamps.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h2 className="text-2xl font-bold mb-4">AI Suggested Timestamps</h2>
                <div className="space-y-2">
                  {suggestedTimestamps.map(timestamp => (
                    <div
                      key={`${timestamp.time}-${timestamp.title}`}
                      className="flex items-center justify-between bg-gray-700 p-3 rounded-lg"
                    >
                      <div className="flex items-center space-x-4">
                        <span className="text-blue-400 font-mono">
                          {timestamp.formattedTime}
                        </span>
                        <span>{timestamp.title}</span>
                        <span className="text-sm text-gray-400">
                          (Confidence: {Math.round(timestamp.confidence * 100)}%)
                        </span>
                      </div>
                      <button
                        onClick={() => acceptSuggestedTimestamp(timestamp)}
                        className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {timestamps.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold">Timestamps</h2>
                  <div className="space-x-2">
                    <button
                      onClick={() => exportTimestamps('youtube')}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
                    >
                      Export for YouTube
                    </button>
                    <button
                      onClick={() => exportTimestamps('markdown')}
                      className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg"
                    >
                      Export as Markdown
                    </button>
                    <button
                      onClick={() => exportTimestamps('json')}
                      className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg"
                    >
                      Export as JSON
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {timestamps.map(timestamp => (
                    <div
                      key={timestamp.id}
                      className="flex items-center justify-between bg-gray-700 p-3 rounded-lg"
                    >
                      <div className="flex items-center space-x-4">
                        <span className="text-blue-400 font-mono">
                          {timestamp.formattedTime}
                        </span>
                        <span>{timestamp.title}</span>
                      </div>
                      <button
                        onClick={() => removeTimestamp(timestamp.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
} 