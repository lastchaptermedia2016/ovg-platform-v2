import { KineticState } from "@/core/widget/hooks/useChatWidget";

export const Bubble = ({
  status,
  onClick,
}: {
  status: KineticState;
  onClick: () => void;
}) => {
  return (
    <div
      onClick={onClick}
      className={`relative w-16 h-16 rounded-full cursor-pointer transition-all duration-500
        ${status === "idle" ? "bg-[#001A2C] border-2 border-gold-500 animate-pulse" : ""}
        ${status === "thinking" ? "bg-[#001A2C] border-4 border-gold-400 animate-spin-fast" : ""}
        ${status === "speaking" ? "bg-[#001A2C] shadow-[0_0_20px_var(--primary-gold)]" : ""}
        ${status === "error" ? "bg-red-600 border-red-400 shadow-[0_0_30px_red]" : ""}
      `}
    >
      {/* The Central Reactor Icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Your Gold 3D Icon or Logo */}
      </div>
    </div>
  );
};
