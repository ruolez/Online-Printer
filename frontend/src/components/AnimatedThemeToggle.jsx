import { useTheme } from "./theme-provider";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";

export function AnimatedThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <motion.button
      className="fixed top-5 right-4 p-2 sm:p-3 rounded-full bg-card dark:bg-card/80 dark:dark-glass border border-border dark:border-border/50 shadow-lg dark:glow-hover transition-all duration-300 z-[60]"
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={false}
        animate={{
          rotate: theme === "dark" ? 360 : 0,
        }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      >
        {theme === "dark" ? (
          <Moon className="h-4 w-4 sm:h-5 sm:w-5 text-sky-400" />
        ) : (
          <Sun className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
        )}
      </motion.div>
    </motion.button>
  );
}