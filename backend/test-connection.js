const AWS = require('aws-sdk');
const axios = require('axios');
require('dotenv').config();

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const s3 = new AWS.S3();

async function testConnections() {
  console.log('Testing connections...\n');

  // Test AWS S3
  try {
    console.log('Testing AWS S3 connection...');
    const buckets = await s3.listBuckets().promise();
    console.log('✅ AWS S3 connection successful!');
    console.log('Available buckets:', buckets.Buckets.map(b => b.Name).join(', '));
  } catch (error) {
    console.error('❌ AWS S3 connection failed:', error.message);
  }

  // Test AssemblyAI
  try {
    console.log('\nTesting AssemblyAI connection...');
    const response = await axios.post('https://api.assemblyai.com/v2/transcript', 
      { audio_url: "https://example.com/test.mp3" },
      {
        headers: {
          'Authorization': process.env.ASSEMBLYAI_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ AssemblyAI connection successful!');
    console.log('API Response:', response.data);
  } catch (error) {
    console.error('❌ AssemblyAI connection failed:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
  }
}

testConnections(); 