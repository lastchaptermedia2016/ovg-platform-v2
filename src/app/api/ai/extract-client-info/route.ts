import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(request: Request) {
  try {
    const { transcript, fields } = await request.json();
    
    if (!transcript || !fields) {
      return NextResponse.json({ error: 'Transcript and fields are required' }, { status: 400 });
    }

    // Create prompt for Groq to extract specific fields with semantic mapping
    const fieldDescriptions = {
      name: 'client business name (exact business name)',
      industry: 'industry sector (must be one of: AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, GENERAL BUSINESS)',
      email: 'email address (with @ and domain)',
      mobile: 'phone number (in E.164 format with + country code if possible)',
      website: 'website URL (with proper domain format, normalize "dot com" to ".com")',
      vibe: 'business personality or description'
    };

    const prompt = `Extract the following information from this transcript: "${transcript}"

Fields to extract:
${fields.map((field: string) => `- ${field}: ${fieldDescriptions[field as keyof typeof fieldDescriptions] || field}`).join('\n')}

Semantic Mapping Rules:
- For website: Normalize "dot com" to ".com", remove spaces, ensure proper domain format
- For mobile: Format to E.164 (+1 for US numbers if country code missing)
- For industry: Map to exact enum values: AUTOMOTIVE, RETAIL, HEALTHCARE, INSURANCE, GENERAL BUSINESS
- For name: Extract exact business name, no generic terms

Return ONLY a JSON object with the extracted fields. If a field is not found, omit it from the JSON. Do not include any explanations or additional text.

Example format:
{
  "name": "Acme Corp",
  "industry": "GENERAL BUSINESS",
  "website": "acmecorp.com"
}`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'You are a data extraction assistant. Extract specific information from transcripts and return only JSON objects. Be precise and accurate.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from Groq');
    }

    // Parse the JSON response
    let extractedData: Record<string, any> = {};
    try {
      extractedData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse Groq response:', content);
      // Fallback: try to extract using regex if JSON parsing fails
      extractedData = {};
      
      if (fields.includes('name')) {
        const nameMatch = transcript.match(/(?:client|company|business)\s+(?:name\s+)?(?:is\s+)?([A-Z][a-zA-Z\s&]+?)(?:\s+(?:in|and|with)|$)/i);
        if (nameMatch) extractedData.name = nameMatch[1].trim();
      }
      
      if (fields.includes('industry')) {
        const industries = ['technology', 'healthcare', 'finance', 'retail', 'automotive', 'insurance', 'real estate', 'manufacturing', 'consulting', 'education'];
        const foundIndustry = industries.find(industry => 
          transcript.toLowerCase().includes(industry.toLowerCase())
        );
        if (foundIndustry) extractedData.industry = foundIndustry;
      }
    }

    console.log('OVG-PLATFORM-V2: Extracted client info:', extractedData);

    return NextResponse.json(extractedData);

  } catch (error: any) {
    console.error('Error extracting client info:', error);
    return NextResponse.json(
      { error: 'Failed to extract client information' },
      { status: 500 }
    );
  }
}
