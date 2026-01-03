const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let imageData;
    let mediaType;

    if (req.body.imageData) {
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
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          parsed = JSON.parse(objectMatch[0]);
        } else {
          throw new Error('Could not parse response as JSON');
        }
      }
    }

    res.status(200).json(parsed);

  } catch (error) {
    console.error('Error parsing medications:', error);
    res.status(500).json({ 
      error: 'Failed to parse medications', 
      details: error.message 
    });
  }
}
