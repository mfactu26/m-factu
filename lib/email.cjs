async function sendEmail({to, subject, text, html}) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    const e = new Error("EMAIL_NOT_CONFIGURED"); e.code="EMAIL_NOT_CONFIGURED"; throw e;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{
      Authorization:"Bearer "+process.env.RESEND_API_KEY,
      "content-type":"application/json"
    },
    body:JSON.stringify({
      from:process.env.EMAIL_FROM,
      to:Array.isArray(to)?to:[to],
      subject,
      text,
      html
    })
  });
  const data=await r.json();
  if(!r.ok){const e=new Error(data?.message||"EMAIL_SEND_FAILED");e.code="EMAIL_SEND_FAILED";throw e}
  return data;
}
module.exports={sendEmail};
