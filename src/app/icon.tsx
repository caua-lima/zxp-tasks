import { ImageResponse } from "next/og";
import { comoDataUri, svgFavicon } from "@/lib/marca";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Favicon com a marca oficial (ver src/lib/marca.ts): traço azul sobre
// contêiner onyx, a mesma construção do ícone do app. Já foi invertido
// (fundo cheio, Z vazado) por nitidez em 16px; o documento de identidade
// define uma construção única pra família e ela vale mais que isso.
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={comoDataUri(svgFavicon())} alt="" width={32} height={32} />
      </div>
    ),
    { ...size },
  );
}
