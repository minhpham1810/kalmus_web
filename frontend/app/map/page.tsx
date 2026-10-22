import MapVariantPage from "./[variant]/page";

export const dynamic = "force-dynamic";

// /map is the original design; the others live at /map/<variant>
export default function MapPage() {
  return MapVariantPage({ params: Promise.resolve({ variant: "dominant" }) });
}
