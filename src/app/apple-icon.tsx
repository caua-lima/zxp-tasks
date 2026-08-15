import { ImageResponse } from "next/og";
import { comoDataUri, svgAppIcon } from "@/lib/marca";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Ícone de tela inicial do iOS, com a marca oficial (ver src/lib/marca.ts).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={comoDataUri(svgAppIcon())} alt="" width={180} height={180} />
      </div>
    ),
    { ...size },
  );
}
