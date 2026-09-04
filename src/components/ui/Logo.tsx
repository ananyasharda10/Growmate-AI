import logoIcon from "../../assets/logo-icon.png";

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src={logoIcon}
      alt=""
      width={size}
      height={size}
      className="shrink-0 select-none"
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
