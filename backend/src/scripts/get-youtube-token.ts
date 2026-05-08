import * as readline from 'readline';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      '\n❌ Error: YOUTUBE_CLIENT_ID y YOUTUBE_CLIENT_SECRET deben estar configurados en .env\n',
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob',
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
    ],
    prompt: 'consent',
  });

  console.log('\n════════════════════════════════════════════════');
  console.log('     Video Engine IA — Configuración YouTube');
  console.log('════════════════════════════════════════════════\n');
  console.log('1. Abre esta URL en tu navegador:\n');
  console.log(authUrl);
  console.log('\n2. Autoriza la aplicación con tu cuenta de YouTube.');
  console.log('3. Copia el código de autorización que aparece.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Pega el código de autorización aquí: ', async (code) => {
    rl.close();

    try {
      const { tokens } = await oauth2Client.getToken(code.trim());

      console.log('\n✅ ¡Autorización exitosa!\n');
      console.log('Agrega esta línea a tu archivo backend/.env:\n');
      console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\nO guárdalo en la base de datos para la institución correspondiente.');
      console.log(
        '\nPara guardar en DB:\n' +
        '  PUT /api/institutions/{id}\n' +
        '  Body: { "youtube_refresh_token": "' + (tokens.refresh_token ?? 'TOKEN') + '" }\n',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('\n❌ Error al obtener token:', msg);
      process.exit(1);
    }
  });
}

main().catch(console.error);
