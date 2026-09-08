export const dynamic = 'force-dynamic'; // Ensure this route is not statically cached

export async function GET() {
  const webhookUrl = "https://script.google.com/a/macros/devstree.in/s/AKfycbxmZl5ZbkFh_M_b5oRAGDANSWoTC81H0SIMCA-NHp8gJmw8Eg_Cu7EW7q7tVxvrxExZ/exec";

  if (!webhookUrl) {
    return new Response('Webhook URL is not configured', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'GET',
    });

    const data = await response.json();

    if (data.success && Array.isArray(data.emails)) {
      // Remove the header row if the first item is 'Email' or similar
      let emails = data.emails;
      if (emails.length > 0 && emails[0].toLowerCase().includes('email')) {
        emails = emails.slice(1);
      }

      // Join the emails with newlines
      const plainText = emails.join('\n') + '\n';

      return new Response(plainText, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store, max-age=0', // Prevent caching
        },
      });
    } else {
      return new Response('Failed to retrieve emails from webhook', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  } catch (error) {
    console.error('Error fetching emails:', error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
