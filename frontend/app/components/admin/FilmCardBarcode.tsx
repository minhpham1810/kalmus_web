/**
 * mini barcode preview in film card
 */
export default function FilmCardBarcode({ jobId }: { jobId: string }) {
  return (
    <div
      style={{
        marginTop: 8,
        width: "100%",
        maxWidth: 200,
        height: 40,
        overflow: "hidden",
      }}
    >
      <img
        src={`/api/barcode-image/${jobId}`}
        alt="Barcode preview"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "fill",
          border: "1px solid rgba(100,100,100,0.25)",
          display: "block",
        }}
        onError={(e) => {
          // hide preview if mini barcode can't be loaded
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}