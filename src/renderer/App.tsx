/**
 * Componente raíz de la interfaz de usuario en React.
 */

export function App(): { type: string; props: { children: string } } {
  // Retorna estructura básica compatible mientras se configuran dependencias de React
  return {
    type: 'div',
    props: {
      children: 'Peripherals Hub UI — Ajazz AJ159 Pro & MAD60HE Hub',
    },
  };
}
