declare global {
  interface Window {
    Telegram: any;
  }
   interface Window {
    webkitSpeechRecognition: any;
  }

  declare var grecaptcha;

  namespace NodeJS {
    interface ProcessEnv {
      /** Authorization token for the bot. This is used to validate the hash's authenticity. */
      BOT_TOKEN: string;
    }
  }
}

export {};
