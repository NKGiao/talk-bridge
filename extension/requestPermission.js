// Simple script to request microphone permission
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    console.info("[GM MeetMind] [Permission] Microphone access granted");
    // immediately stop tracks so the user doesn't see the "recording" indicator
    stream.getTracks().forEach(t => t.stop());
  })
  .catch(err => {
    console.error("[GM MeetMind] [Permission] Permission denied", err);
  });
