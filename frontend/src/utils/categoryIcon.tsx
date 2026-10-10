import {
  Armchair,
  Box,
  CircuitBoard,
  Cpu,
  Fan,
  Gamepad2,
  HardDrive,
  Headphones,
  Keyboard,
  Laptop,
  MemoryStick,
  Monitor,
  Mouse,
  Power,
  Router,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Ícone da categoria pelo nome/slug (ex.: "placas-de-video" -> placa).
const RULES: [RegExp, LucideIcon][] = [
  [/placa|gpu|video|vídeo/, CircuitBoard],
  [/processador|cpu/, Cpu],
  [/mem[oó]ria|ram/, MemoryStick],
  [/ssd|hd|armazen|disco/, HardDrive],
  [/monitor|tela/, Monitor],
  [/teclado/, Keyboard],
  [/mouse/, Mouse],
  [/fone|headset|audio|áudio/, Headphones],
  [/fonte|psu/, Power],
  [/cooler|refrigera|water/, Fan],
  [/notebook|laptop/, Laptop],
  [/cadeira/, Armchair],
  [/rede|roteador|wifi/, Router],
  [/console|controle|game/, Gamepad2],
]

export function categoryIcon(nameOrSlug: string): LucideIcon {
  const key = nameOrSlug.toLowerCase()
  return RULES.find(([re]) => re.test(key))?.[1] ?? Box
}
