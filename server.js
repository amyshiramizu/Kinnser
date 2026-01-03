const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Parse medication list from image
app.post('/api/parse', upload.single('image'), async (req, res) => {
  try {
    let imageData;
    let mediaType;

    if (req.file) {
      // File upload
      imageData = req.file.buffer.toString('base64');
      mediaType = req.file.mimetype;
    } else if (req.body.imageData) {
      // Base64 from paste
      const matches = req.body.imageData.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        mediaType = matches[1];
        imageData = matches[2];
      } else {
        imageData = req.body.imageData;
        mediaType = 'image/png';
      }
    } else {
      return res.status(400).json({ error: 'No image provided' });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageData
              }
            },
            {
              type: 'text',
              text: `Extract all medications from this medication list image. For each medication, provide:

1. medication_name: The full medication name including strength and form (e.g., "Lisinopril 10 MG Oral Tablet")
2. frequency: How often taken (e.g., "daily", "twice daily", "4 times daily", "every 8 hours", "at bedtime")
3. instructions: The full SIG/directions (e.g., "Take 1 tablet by mouth daily")
4. is_prn: true if it's "as needed" or PRN, false otherwise
5. indication: The diagnosis or reason if listed, otherwise empty string

Return ONLY valid JSON in this exact format, no other text:
{
  "medications": [
    {
      "medication_name": "...",
      "frequency": "...",
      "instructions": "...",
      "is_prn": true/false,
      "indication": "..."
    }
  ]
}`
            }
          ]
        }
      ]
    });

    // Extract JSON from response
    const content = response.content[0].text;
    let parsed;
    
    try {
      // Try to parse directly
      parsed = JSON.parse(content);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        // Try to find JSON object in the response
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          parsed = JSON.parse(objectMatch[0]);
        } else {
          throw new Error('Could not parse response as JSON');
        }
      }
    }

    res.json(parsed);

  } catch (error) {
    console.error('Error parsing medications:', error);
    res.status(500).json({ 
      error: 'Failed to parse medications', 
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Med List Parser running on port ${PORT}`);
});
