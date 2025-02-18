'use client';

import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [transcriptionId, setTranscriptionId] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.size <= 4 * 1024 * 1024 * 1024) { // 4GB
      setFile(droppedFile);
    } else {
      setError('File size must be less than 4GB');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.size <= 4 * 1024 * 1024 * 1024) {
      setFile(selectedFile);
    } else {
      setError('File size must be less than 4GB');
    }
  }, []);

  const uploadFile = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      // Get pre-signed URL
      const { data: { uploadUrl, key } } = await axios.post('http://localhost:3001/api/getUploadUrl', {
        fileName: file.name,
        fileType: file.type,
      });

      // Upload to S3
      await axios.put(uploadUrl, file, {
        headers: {
          'Content-Type': file.type,
        },
      });

      // Start transcription
      const { data: transcriptionData } = await axios.post('http://localhost:3001/api/transcribe', { key });
      setTranscriptionId(transcriptionData.id);

      // Poll for transcription status
      const pollInterval = setInterval(async () => {
        const { data: status } = await axios.get(`http://localhost:3001/api/transcription/${transcriptionData.id}`);
        
        if (status.status === 'completed') {
          setTranscription(status);
          clearInterval(pollInterval);
          setUploading(false);
        } else if (status.status === 'error') {
          setError('Transcription failed');
          clearInterval(pollInterval);
          setUploading(false);
        }
      }, 5000);
    } catch (err) {
      setError('Upload failed');
      setUploading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">Video Transcription Tool</h1>
        
        <div
          className="upload-area p-10 text-center cursor-pointer"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            type="file"
            id="file-input"
            className="hidden"
            accept="video/*"
            onChange={handleFileSelect}
          />
          <CloudArrowUpIcon className="h-12 w-12 mx-auto mb-4" />
          <p className="text-lg mb-2">
            {file ? file.name : 'Drag and drop your video here or click to browse'}
          </p>
          <p className="text-sm text-gray-400">Maximum file size: 4GB</p>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-500 bg-opacity-20 rounded-lg text-red-500">
            {error}
          </div>
        )}

        {file && !uploading && !transcription && (
          <button
            onClick={uploadFile}
            className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Start Transcription
          </button>
        )}

        {uploading && (
          <div className="mt-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            <p className="mt-2">Processing your video...</p>
          </div>
        )}

        {transcription && (
          <div className="mt-8 p-6 bg-gray-800 rounded-lg">
            <h2 className="text-2xl font-bold mb-4">Transcription</h2>
            {transcription.utterances?.map((utterance: any, index: number) => (
              <div key={index} className="mb-4">
                <p className="text-blue-400">Speaker {utterance.speaker}: </p>
                <p className="ml-4">{utterance.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
