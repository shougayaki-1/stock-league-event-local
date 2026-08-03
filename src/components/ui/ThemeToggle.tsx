import { Sun, Monitor, Moon } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import SegmentedControl from "./SegmentedControl";

type Theme = "light" | "system" | "dark";

interface Props {
  className?: string;
  buttonClassName?: string;
  showText?: boolean;
}

export default function ThemeToggle({ className = "", buttonClassName = "", showText = false }: Props) {
  const { theme, setTheme } = useTheme();

  return (
    <SegmentedControl<Theme>
      value={theme}
      onChange={setTheme}
      className={className}
      buttonClassName={buttonClassName}
      items={[
        { value: "light", label: showText ? "ライト" : null, icon: <Sun size={16} />, title: "ライトモード" },
        { value: "system", label: showText ? "自動" : null, icon: <Monitor size={16} />, title: "自動" },
        { value: "dark", label: showText ? "ダーク" : null, icon: <Moon size={16} />, title: "ダークモード" },
      ]}
    />
  );
}
