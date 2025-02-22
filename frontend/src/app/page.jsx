'use client';

import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

// Add API base URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
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
      setUploadProgress(0);
      setProcessingStatus('Preparing upload...');

      console.log('Starting upload process...');
      console.log('File details:', {
        name: file.name,
        type: file.type,
        size: file.size
      });

      // Get pre-signed URL
      setProcessingStatus('Getting upload URL...');
      console.log('Getting pre-signed URL from:', `${API_URL}/api/getUploadUrl`);
      const { data: { uploadUrl, key } } = await axios.post(`${API_URL}/api/getUploadUrl`, {
        fileName: file.name,
        fileType: file.type,
      });

      console.log('Received pre-signed URL:', uploadUrl);
      console.log('File key:', key);

      // Upload to S3 with chunked upload and retry logic
      const RETRY_ATTEMPTS = 3;
      const RETRY_DELAY = 2000; // 2 seconds

      const uploadWithRetry = async (attempt = 0) => {
        try {
          setProcessingStatus('Uploading file...');
          
          // Check connection speed before upload
          const testConnection = async () => {
            const start = Date.now();
            try {
              await fetch(`${API_URL}/api/getUploadUrl`, { method: 'HEAD' });
              const duration = Date.now() - start;
              console.log(`Connection test latency: ${duration}ms`);
              return duration < 1000; // Consider connection good if latency < 1s
            } catch (e) {
              console.warn('Connection test failed:', e);
              return true; // Continue with upload even if test fails
            }
          };

          await testConnection();

          const uploadResponse = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl, true);
            xhr.setRequestHeader('Content-Type', file.type);
            
            let lastProgress = 0;
            let stallTimer = null;
            
            const resetStallTimer = () => {
              if (stallTimer) clearTimeout(stallTimer);
              stallTimer = setTimeout(() => {
                console.warn('Upload appears to be stalled');
                xhr.abort();
                reject(new Error('Upload stalled'));
              }, 30000); // 30 second stall timeout
            };

            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const percentCompleted = Math.round((event.loaded * 100) / event.total);
                if (percentCompleted > lastProgress) {
                  lastProgress = percentCompleted;
                  resetStallTimer();
                }
                setUploadProgress(percentCompleted);
                console.log(`Upload progress: ${percentCompleted}%`);
              }
            };

            xhr.onload = () => {
              if (stallTimer) clearTimeout(stallTimer);
              if (xhr.status === 200 || xhr.status === 204) {
                console.log('Upload completed successfully');
                resolve({ status: xhr.status });
              } else {
                console.error('Upload failed:', {
                  status: xhr.status,
                  statusText: xhr.statusText,
                  response: xhr.responseText,
                  headers: xhr.getAllResponseHeaders()
                });
                reject(new Error(`Upload failed with status: ${xhr.status}`));
              }
            };

            xhr.onerror = (e) => {
              if (stallTimer) clearTimeout(stallTimer);
              const errorDetails = {
                type: e.type,
                loaded: xhr.upload.loaded,
                total: file.size,
                readyState: xhr.readyState,
                status: xhr.status,
                statusText: xhr.statusText,
                responseHeaders: xhr.getAllResponseHeaders(),
                uploadUrl: uploadUrl
              };
              console.error('Network error during upload:', errorDetails);
              reject(new Error(`Network error during upload: ${JSON.stringify(errorDetails)}`));
            };

            xhr.ontimeout = () => {
              if (stallTimer) clearTimeout(stallTimer);
              console.error('Upload timed out');
              reject(new Error('Upload timed out'));
            };

            xhr.timeout = 3600000; // 1 hour timeout
            resetStallTimer();
            
            console.log('Starting upload with URL:', uploadUrl);
            console.log('File details:', {
              name: file.name,
              type: file.type,
              size: file.size
            });
            
            xhr.send(file);
          });

          console.log('Upload successful:', uploadResponse);
          return uploadResponse;
        } catch (error) {
          console.error(`Upload attempt ${attempt + 1} failed:`, error);
          if (attempt < RETRY_ATTEMPTS - 1) {
            const delay = RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
            setProcessingStatus(`Upload failed, retrying in ${delay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return uploadWithRetry(attempt + 1);
          }
          throw error;
        }
      };

      await uploadWithRetry();
      setProcessingStatus('Upload complete, starting transcription...');

      // Start transcription
      console.log('Starting transcription process...');
      const { data: transcriptionData } = await axios.post(`${API_URL}/api/transcribe`, { key });
      setTranscriptionId(transcriptionData.id);
      console.log('Transcription started:', transcriptionData);
      setProcessingStatus('Transcription started, processing audio...');

      // Poll for transcription status
      let lastStatus = '';
      const pollInterval = setInterval(async () => {
        const { data: status } = await axios.get(`${API_URL}/api/transcription/${transcriptionData.id}`);
        console.log('Transcription status:', status);
        
        if (status.status !== lastStatus) {
          lastStatus = status.status;
          setProcessingStatus(`Transcription status: ${status.status}`);
        }
        
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
          setProcessingStatus('');
          setUploadProgress(0);
        } else if (status.status === 'error') {
          setError('Transcription failed');
          clearInterval(pollInterval);
          setUploading(false);
          setProcessingStatus('');
          setUploadProgress(0);
        }
      }, 5000);
    } catch (err) {
      console.error('Upload error:', {
        message: err.message,
        code: err.code,
        response: err.response?.data,
        status: err.response?.status
      });
      setError('Upload failed');
      setUploading(false);
      setProcessingStatus('');
      setUploadProgress(0);
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
            <div className="w-full bg-slate-700 rounded-full h-2.5 mb-4">
              <div 
                className="bg-[#818CF8] h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#818CF8] mx-auto mb-2"></div>
            <p className="mt-2 text-gray-300">{processingStatus}</p>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <p className="text-sm text-gray-400">Upload Progress: {uploadProgress}%</p>
            )}
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