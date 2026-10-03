async function sendEmail({to, subject, text, html, from, replyTo, headers, attachments}) {
  if (!process.env.RESEND_API_KEY || (!process.env.EMAIL_FROM && !from)) {
    const e = new Error("EMAIL_NOT_CONFIGURED"); e.code="EMAIL_NOT_CONFIGURED"; throw e;
  }
  const payload={
    from:from||process.env.EMAIL_FROM,
    to:Array.isArray(to)?to:[to],
    subject,
    text
  };
  if(html) payload.html=html;
  if(Array.isArray(replyTo)&&replyTo.length) payload.reply_to=replyTo;
  if(headers&&typeof headers==="object") payload.headers=headers;
  if(Array.isArray(attachments)&&attachments.length){
    payload.attachments=attachments.map(a=>({filename:a.filename,content:a.content,content_type:a.contentType||"application/pdf"}));
  }

  const r = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{
      Authorization:"Bearer "+process.env.RESEND_API_KEY,
      "content-type":"application/json"
    },
    body:JSON.stringify(payload)
  });
  const data=await r.json();
  if(!r.ok){const e=new Error(data?.message||"EMAIL_SEND_FAILED");e.code="EMAIL_SEND_FAILED";e.details=data;throw e}
  return data;
}
module.exports={sendEmail};
