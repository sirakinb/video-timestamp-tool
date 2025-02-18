'use client';

import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

// Add API base URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [transcriptionId, setTranscriptionId] = useState(null);
  const [transcription, setTranscription] = useState(null);
  const [error, setError] = useState(null);
  const [speakers, setSpeakers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.size <= 4 * 1024 * 1024 * 1024) {
      setFile(droppedFile);
    } else {
      setError('File size must be less than 4GB');
    }
  }, []);

  const handleFileSelect = useCallback((e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.size <= 4 * 1024 * 1024 * 1024) {
      setFile(selectedFile);
    } else {
      setError('File size must be less than 4GB');
    }
  }, []);

  const handleSpeakerNameChange = (speakerId, newName) => {
    setSpeakers(prevSpeakers => {
      const existingSpeaker = prevSpeakers.find(s => s.id === speakerId);
      if (existingSpeaker) {
        return prevSpeakers.map(s => 
          s.id === speakerId ? { ...s, name: newName } : s
        );
      }
      return [...prevSpeakers, { id: speakerId, name: newName }];
    });
  };

  const getSpeakerName = (speakerId) => {
    const speaker = speakers.find(s => s.id === speakerId);
    return speaker ? speaker.name : `Speaker ${speakerId}`;
  };

  const handleEditClick = (utterance) => {
    if (editingId === utterance.id) {
      // Save the changes
      handleTextEdit(utterance.id, editingText);
      setEditingId(null);
    } else {
      // Enter edit mode
      setEditingId(utterance.id);
      setEditingText(utterance.text);
    }
  };

  const handleTextEdit = (id, newText) => {
    if (!transcription) return;
    setTranscription({
      ...transcription,
      utterances: transcription.utterances.map(u => 
        u.id === id ? { ...u, text: newText } : u
      )
    });
  };

  const handleDeleteSegment = (id) => {
    if (!transcription) return;
    if (confirm('Are you sure you want to delete this segment?')) {
      setTranscription({
        ...transcription,
        utterances: transcription.utterances.filter(u => u.id !== id)
      });
    }
  };

  const downloadTranscript = () => {
    if (!transcription) return;
    const text = transcription.utterances.map(u => 
      `${getSpeakerName(u.speaker)}: ${u.text}`
    ).join('\n\n');
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const processTranscript = async () => {
    if (!transcription) return;
    try {
      const formattedTranscript = transcription.utterances
        .map(u => `[${getSpeakerName(u.speaker)}]: ${u.text}`)
        .join('\n\n');

      const response = await axios.post(
        'https://hook.us2.make.com/qrr5gv8o2rmfjltj5jq04f9ssh3hk53a',
        {
          formatted_transcript: formattedTranscript
        }
      );
      alert('Transcript processed successfully!');
    } catch (error) {
      setError('Failed to process transcript');
    }
  };

  const uploadFile = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      // Get pre-signed URL
      const { data: { uploadUrl, key } } = await axios.post(`${API_URL}/api/getUploadUrl`, {
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
      const { data: transcriptionData } = await axios.post(`${API_URL}/api/transcribe`, { key });
      setTranscriptionId(transcriptionData.id);

      // Poll for transcription status
      const pollInterval = setInterval(async () => {
        const { data: status } = await axios.get(`${API_URL}/api/transcription/${transcriptionData.id}`);
        
        if (status.status === 'completed') {
          setTranscription({
            ...status,
            utterances: status.utterances.map((u, index) => ({
              ...u,
              id: `utterance-${index}`
            }))
          });
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
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center text-[#818CF8]">FunTimes Video Transcription</h1>
        
        <div
          className="upload-area p-10 text-center cursor-pointer bg-slate-900/50"
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
          <CloudArrowUpIcon className="h-12 w-12 mx-auto mb-4 text-[#818CF8]" />
          <p className="text-lg mb-2">
            {file ? file.name : 'Drag and drop your video here or click to browse'}
          </p>
          <p className="text-sm text-gray-400">Maximum file size: 4GB</p>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-500/20 rounded-lg text-red-500">
            {error}
          </div>
        )}

        {file && !uploading && !transcription && (
          <button
            onClick={uploadFile}
            className="mt-4 w-full bg-[#818CF8] hover:bg-[#6366F1] text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Start Transcription
          </button>
        )}

        {uploading && (
          <div className="mt-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#818CF8] mx-auto"></div>
            <p className="mt-2">Processing your video...</p>
          </div>
        )}

        {transcription && (
          <div className="mt-8 p-6 bg-slate-900/50 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-[#818CF8]">Transcription</h2>
              <div className="space-x-4">
                <button
                  onClick={downloadTranscript}
                  className="bg-[#818CF8] hover:bg-[#6366F1] text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Download
                </button>
                <button
                  onClick={processTranscript}
                  className="bg-[#818CF8] hover:bg-[#6366F1] text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Process
                </button>
              </div>
            </div>
            {transcription.utterances?.map((utterance) => (
              <div key={utterance.id} className="mb-6 bg-slate-800/50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={getSpeakerName(utterance.speaker)}
                      onChange={(e) => handleSpeakerNameChange(utterance.speaker, e.target.value)}
                      className="text-[#818CF8] bg-transparent border-b border-[#818CF8] focus:outline-none px-2 py-1"
                    />
                    <span className="text-gray-400">:</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditClick(utterance)}
                      className="text-[#818CF8] hover:text-[#6366F1] transition-colors px-3 py-1 rounded"
                    >
                      {editingId === utterance.id ? 'Save' : 'Edit'}
                    </button>
                    <button
                      onClick={() => handleDeleteSegment(utterance.id)}
                      className="text-red-500 hover:text-red-400 transition-colors px-3 py-1 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {editingId === utterance.id ? (
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    className="w-full ml-4 p-2 bg-slate-700/50 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#818CF8]"
                    rows={3}
                  />
                ) : (
                  <p className="ml-4 text-gray-200">{utterance.text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
} 