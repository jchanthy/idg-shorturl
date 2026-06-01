fetch('https://simple-shortener-kappa.vercel.app/').then(r=>r.text()).then(t=>{ 
  const match = t.match(/src="([^"]+\.js)"/); 
  if(match) {
    let jsUrl = match[1];
    if(!jsUrl.startsWith('http')) jsUrl = 'https://simple-shortener-kappa.vercel.app' + jsUrl;
    fetch(jsUrl).then(r=>r.text()).then(js=>{ 
      const fb = js.match(/[a-zA-Z0-9-]+\.firebaseapp\.com/g); 
      console.log(fb ? fb : 'not found'); 
    }) 
  } 
})
