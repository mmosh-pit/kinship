export default function Spinner({
  size = "md",
}: {
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm" ? "loading-sm" : size === "lg" ? "loading-lg" : "loading-md";

  return <span className={`loading loading-spinner ${sizeClass}`} />;
}
