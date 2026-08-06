// Streaming de radio en vivo, ajeno al backend del pipeline de transcripción
// (a diferencia de lib/api.ts, esto no habla con http://localhost:3000).
//
// El sitio de origen (emisorascolombianas.co) publica la URL del stream
// ofuscada como { cipher, iv } en un <script id="radio-streams-json">, mismo
// patrón para todas sus emisoras. Verificado con la pestaña de red (Playwright)
// que NO hace falta descifrar eso: al reproducir, el propio sitio pide
// `https://mdstrm.com/audio/{id}/icecast.audio`, que responde 302 hacia una
// URL firmada de corta duración en *.cdn.mdstrm.com. Esa URL "amigable" es
// pública, sin autenticación, con `Access-Control-Allow-Origin: *`, y el
// navegador sigue la redirección solo — sirve tal cual como `src` de <audio>.
//
// El {id} de mdstrm (632cbdb5202d6801a31785b0 para El Sol Barranquilla) es
// específico de cada emisora y no se deriva del cipher sin repetir esta
// inspección manual por cada una — ver docs/TODO.md para agregar más.
export interface RadioStation {
  id: string;
  name: string;
  frequency: string;
  streamUrl: string;
}

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'el-sol-barranquilla',
    name: 'El Sol Barranquilla',
    frequency: '99.1 FM',
    streamUrl: 'https://mdstrm.com/audio/632cbdb5202d6801a31785b0/icecast.audio'
  }
];
