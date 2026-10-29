import { SHOWN_VARIANTS } from "@/lib/film-map";
import MapVariantPage from "./[variant]/page";

export const dynamic = "force-dynamic";

// /map is the default variant; the others live at /map/<variant>
export default function MapPage() {
  return MapVariantPage({ params: Promise.resolve({ variant: SHOWN_VARIANTS[0] }) });
}
