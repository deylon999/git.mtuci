import { Check } from "lucide-react";

interface CustomCheckboxProps {
  checked: boolean;
  onChange?: () => void;
  className?: string;
  isDarkTheme?: boolean;
}

export function CustomCheckbox({ checked, onChange, className = "", isDarkTheme = true }: CustomCheckboxProps) {
  const uncheckedBg = isDarkTheme ? "bg-[#1e1e1e]" : "bg-white";
  const uncheckedBorder = isDarkTheme ? "border-[#3f3f46]" : "border-slate-300";
  const uncheckedHover = isDarkTheme ? "hover:border-[#52525b]" : "hover:border-slate-400";

  return (
    <div
      onClick={onChange}
      className={`
        w-[18px] h-[18px] rounded-[4px] cursor-pointer transition-all duration-200 ease-in-out
        flex items-center justify-center shrink-0
        ${checked
          ? "bg-blue-500 border border-blue-500"
          : `${uncheckedBg} border ${uncheckedBorder} ${uncheckedHover}`
        }
        ${className}
      `}
    >
      {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
    </div>
  );
}

export default CustomCheckbox;
