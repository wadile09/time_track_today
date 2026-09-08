const webhookUrl = "https://script.google.com/a/macros/devstree.in/s/AKfycbxmZl5ZbkFh_M_b5oRAGDANSWoTC81H0SIMCA-NHp8gJmw8Eg_Cu7EW7q7tVxvrxExZ/exec"

export async function logEmailToFile(email: string) {
  if (!email || !webhookUrl) return false;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.trim() }),
    })

    // Some Google scripts return redirect HTML. We only try to parse JSON if we can
    const text = await response.text()
    try {
      const data = JSON.parse(text)
      if (!data.success) {
        console.error('Webhook error:', data.error)
        return false;
      }
    } catch {
      // If it is not JSON, it might be an HTML page from a redirect, but it probably still succeeded
    }

    return true;
  } catch (error) {
    console.error('Webhook fetch error:', error)
    return false;
  }
}
