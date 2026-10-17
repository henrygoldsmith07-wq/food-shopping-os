/**
 * Food icons lucide does not draw, in lucide's own grammar: a 24px grid,
 * currentColor stroke, round caps and joins, no fill. They take the same
 * props as a lucide icon (size, strokeWidth, className, style, aria-*), so
 * the two sets are interchangeable wherever an icon component is expected.
 */

const icon = (displayName, body) => {
  const Icon = ({ size = 24, strokeWidth = 2, color = 'currentColor', className, children, ...rest }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `lucide ${className}` : 'lucide'}
      {...rest}
    >
      {children}
      {body}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
};

/** A deep bowl, shared by the rice, noodle, porridge and grain bowls. */
const BOWL = <path d="M3 12h18a9 8 0 0 1-18 0z" />;

export const Onion = icon('Onion', <>
  <path d="M12 4.5c-1.5 2.5-6.5 4.5-6.5 9.5a6.5 6.5 0 0 0 13 0c0-5-5-7-6.5-9.5z" />
  <path d="M12 4.5V2M12 9.5c-1.5 2-2.2 4.5-2 8M12 9.5c1.5 2 2.2 4.5 2 8M10.5 22l1.5-1.5 1.5 1.5" />
</>);

export const Garlic = icon('Garlic', <>
  <path d="M12 3c0 3-7 5-7 11a5 5 0 0 0 5 5h4a5 5 0 0 0 5-5c0-6-7-8-7-11z" />
  <path d="M12 3V1.5M12 8.5c-2 2.5-3 6-2.5 10.5M12 8.5c2 2.5 3 6 2.5 10.5M10 22h4" />
</>);

export const Potato = icon('Potato', <>
  <path d="M5.5 8.5C7.5 4.5 15 3.5 18.5 7s2 11-3 12.5S3 16 5.5 8.5z" />
  <path d="M9 10h.01M14 9h.01M11.5 14h.01M15.5 14h.01" />
</>);

export const Tomato = icon('Tomato', <>
  <circle cx="12" cy="13.5" r="7.5" />
  <path d="M12 6V3M8.5 6.5c1.5 1 2.5 1 3.5-.5 1 1.5 2 1.5 3.5.5" />
</>);

export const Chilli = icon('Chilli', <>
  <path d="M18 7.5c1 6.5-4.5 12-12 13-1 .1-1.5-1-.5-1.5C11 16 13 11.5 14 7.5c.5-1.5 3.5-1.5 4 0z" />
  <path d="M16 6.5c0-2 1-3 3-3.5" />
</>);

export const Pepper = icon('Pepper', <>
  <path d="M8 7.5c-3 0-4 3-4 6.5S6 21 9 21c1 0 2-.5 3-.5s2 .5 3 .5c3 0 5-3.5 5-7s-1-6.5-4-6.5c-1.5 0-2.5 1-4 1s-2.5-1-4-1z" />
  <path d="M12 8.5V5.5c0-1.2 1-2.5 2.5-2.5M12 12.5v5" />
</>);

export const Mushroom = icon('Mushroom', <>
  <path d="M3 12c0-4.5 4-8 9-8s9 3.5 9 8z" />
  <path d="M9 12v6a3 3 0 0 0 6 0v-6M9 8h.01M14.5 7h.01" />
</>);

export const Broccoli = icon('Broccoli', <>
  <path d="M7 12.5a3 3 0 0 1-.5-6A3.5 3.5 0 0 1 12 4a3.5 3.5 0 0 1 5.5 2.5 3 3 0 0 1-.5 6z" />
  <path d="M10 12.5V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-7.5M12 16l-2-3.5M12 16l2-3.5" />
</>);

export const Avocado = icon('Avocado', <>
  <path d="M12 2.5c-3 0-4.5 3-5 6.5-.5 3-2 4.5-2 7a7 7 0 0 0 14 0c0-2.5-1.5-4-2-7-.5-3.5-2-6.5-5-6.5z" />
  <circle cx="12" cy="15.5" r="2.5" />
</>);

export const Lemon = icon('Lemon', <>
  <path d="M6 18c-3-3-2-8 2-11.5S16.5 3 19 6s2 8-2 11.5S8.5 21 6 18z" />
  <path d="M6 18l-2 2M19 6l1.5-1.5M9 14c1-2.5 3-4.5 5.5-5.5" />
</>);

export const Corn = icon('Corn', <>
  <path d="M12 2.5c-2.2 0-3.5 3-3.5 7.5s1.3 7.5 3.5 7.5 3.5-3 3.5-7.5-1.3-7.5-3.5-7.5z" />
  <path d="M8.7 7.5h6.6M8.5 11h7M9 14.5h6M12 2.5v15" />
  <path d="M8.5 12c-3 1-4 5-3.5 9.5 3-.5 5.5-2 7-4M15.5 12c3 1 4 5 3.5 9.5-3-.5-5.5-2-7-4" />
</>);

export const Peas = icon('Peas', <>
  <path d="M4 19.5C5.5 11 11.5 5.5 20.5 3.5c-1 9-7 15-16.5 16z" />
  <circle cx="8.5" cy="15" r="1.5" /><circle cx="12" cy="11.5" r="1.5" /><circle cx="15.5" cy="8" r="1.5" />
</>);

export const Aubergine = icon('Aubergine', <>
  <path d="M14.5 6.5c3.5 1.5 4.5 5.5 2.5 9-2.5 4-6.5 6-10 5.5-2-.3-3-1.5-2.5-3.5.8-3.5 3-6.5 6-8.5 1.5-1 2.8-2.2 4-2.5z" />
  <path d="M13 7.5c1-2 3.5-2.5 5-1.5s1.5 3.5.5 5M17 5l2.5-2.5" />
</>);

export const Cucumber = icon('Cucumber', <>
  <rect x="2" y="9" width="20" height="6" rx="3" transform="rotate(-45 12 12)" />
  <path d="M9 13.5l1-1M12 10.5l1-1M11.5 15l1-1M14.5 12l1-1" />
</>);

export const Squash = icon('Squash', <>
  <path d="M10 4h4v2.5c0 2 1 3 2 4.5s3 3.5 3 6.5a7 7 0 0 1-14 0c0-3 2-5 3-6.5s2-2.5 2-4.5z" />
  <path d="M12 4V2M9 16a3 3 0 0 0 3 3" />
</>);

export const Leek = icon('Leek', <>
  <path d="M10 22V11.5C10 9 8 5.5 6 3M14 22V11.5c0-2.5 2-6 4-8.5M12 11V3M10 15h4M10 22h4" />
</>);

export const Pear = icon('Pear', <>
  <path d="M12 6.5c-2 0-3 2-3 4 0 1.5-3 3-3 6.5a6 6 0 0 0 12 0c0-3.5-3-5-3-6.5 0-2-1-4-3-4z" />
  <path d="M12 6.5V3M12 4.5c1-1.5 3-2 4-1.5-.5 1.5-2.5 2-4 1.5" />
</>);

export const Strawberry = icon('Strawberry', <>
  <path d="M12 21.5c-4-1-7-6-7-10 0-2 2-3 4-3h6c2 0 4 1 4 3 0 4-3 9-7 10z" />
  <path d="M8.5 8.5L12 5.5l3.5 3M12 5.5V2.5M9.5 12h.01M14.5 12h.01M12 15h.01M10.5 18h.01M13.5 18h.01" />
</>);

export const Cheese = icon('Cheese', <>
  <path d="M3 10.5L15 4.5l6 6M3 10.5h18V19H3z" />
  <circle cx="8" cy="14.5" r="1.5" /><circle cx="15" cy="15" r="1" />
</>);

export const Butter = icon('Butter', <>
  <path d="M4.5 11.5L7.5 7.5H20l-3 4zM4.5 11.5v5.5H17v-5.5M17 17l3-4V7.5M2 20h20" />
</>);

export const Yoghurt = icon('Yoghurt', <>
  <rect x="4" y="3" width="16" height="3" rx="1" />
  <path d="M5.5 6l1.4 14.1a1 1 0 0 0 1 .9h8.2a1 1 0 0 0 1-.9L18.5 6M6.2 11.5h11.6" />
</>);

export const Bread = icon('Bread', <>
  <path d="M4 19.5V13c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5v6.5z" />
  <path d="M8.5 9.5l1.2 2M12 8.5l1.2 2M15.5 9.5l1.2 2" />
</>);

export const Toast = icon('Toast', <>
  <path d="M6 21V11.5A4.5 4.5 0 1 1 12 7a4.5 4.5 0 1 1 6 4.5V21z" />
  <path d="M9 13.5h6" />
</>);

export const Bagel = icon('Bagel', <>
  <ellipse cx="12" cy="13" rx="9.5" ry="6.5" />
  <ellipse cx="12" cy="12.5" rx="3" ry="1.8" />
  <path d="M6.5 10h.01M17.5 10h.01M8 16h.01M16 16h.01M12 8h.01" />
</>);

export const RiceBowl = icon('RiceBowl', <>
  {BOWL}
  <path d="M6 12a6 5 0 0 1 12 0M10 8.5h.01M13.5 8h.01M12 10.5h.01M8.5 11h.01M15.5 11h.01" />
</>);

export const Curry = icon('Curry', <>
  {BOWL}
  <path d="M5 12a4 3 0 0 1 8 0M14 9.5c0-1.5 1-2 1-3.5M17 9.5c0-1.5 1-2 1-3.5" />
</>);

export const Pasta = icon('Pasta', <>
  {BOWL}
  <path d="M5.5 12c1.2-2 2.8-2 4 0s2.8 2 4 0 2.8-2 4 0M15 2v6M13 2v3a2 2 0 0 0 4 0V2" />
</>);

export const NoodleBowl = icon('NoodleBowl', <>
  {BOWL}
  <path d="M13 2l-3.5 9.5M19.5 3.5l-6 8.5M6.5 12c.5-1.5-.5-3 0-4.5M9 12c.5-1-.2-2 0-3" />
</>);

export const PorridgeBowl = icon('PorridgeBowl', <>
  {BOWL}
  <path d="M15.5 6.5L12.5 12M17 2c1 0 1.8 1 1.4 2.4S16.6 6.4 15.8 6s.2-4 1.2-4z" />
</>);

export const GrainBowl = icon('GrainBowl', <>
  {BOWL}
  <path d="M14 10c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6zM6.5 10h.01M9 9h.01M10.5 10.5h.01" />
</>);

export const Wok = icon('Wok', <>
  <path d="M3 11.5h15c0 4-3.4 7-7.5 7S3 15.5 3 11.5zM18 11.5h3.5M8 8.5c0-1.2 1-1.5 1-3M12 8.5c0-1.2 1-1.5 1-3" />
</>);

export const Traybake = icon('Traybake', <>
  <rect x="2.5" y="8.5" width="19" height="10" rx="2" />
  <circle cx="7.5" cy="13.5" r="1.8" /><circle cx="12.5" cy="13.5" r="1.8" /><circle cx="17" cy="13.5" r="1.3" />
</>);

export const Pancakes = icon('Pancakes', <>
  <ellipse cx="12" cy="8" rx="8" ry="2.5" />
  <path d="M4 8v3c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V8M4 11v3c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-3M2 20h20M14.5 10.4v2" />
</>);

export const Taco = icon('Taco', <>
  <path d="M2.5 18.5a9.5 9.5 0 0 1 19 0z" />
  <path d="M7 18.5a5 5 0 0 1 10 0M6 12c1-1 2 .5 3-.5M15 11.5c1 .5 2-.5 3 .5" />
</>);

export const Wrap = icon('Wrap', <>
  <rect x="2" y="8" width="20" height="8" rx="4" transform="rotate(-45 12 12)" />
  <path d="M15.5 5.5c1.5 0 3 1.5 3 3M8 13l3 3" />
</>);

export const Tin = icon('Tin', <>
  <ellipse cx="12" cy="5" rx="7" ry="2.5" />
  <path d="M5 5v14c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5M5 9.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5M5 15c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
</>);

export const Bottle = icon('Bottle', <>
  <path d="M10 2h4v4l2.5 3.5V20a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V9.5L10 6z" />
  <path d="M7.5 13h9M7.5 18h9" />
</>);

export const Jar = icon('Jar', <>
  <rect x="6" y="2" width="12" height="3" rx="1" />
  <path d="M7 5v.5A3 3 0 0 0 5 8.4V19a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8.4a3 3 0 0 0-2-2.9V5M5 12h14M5 17h14" />
</>);

export const Carton = icon('Carton', <>
  <path d="M7 8l2-5h6l2 5v13H7zM7 8h10M12 8V3M9.5 13h5" />
</>);

export const Bag = icon('Bag', <>
  <path d="M6.5 7l1.5-4h8l1.5 4v13a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM6.5 7h11M9.5 12h5M9.5 15.5h5" />
</>);

export const CerealBox = icon('CerealBox', <>
  <rect x="5" y="3" width="14" height="18" rx="1" />
  <path d="M5 7h14M8.5 17a3.5 2.5 0 0 0 7 0zM10 13.5h.01M12.5 12.5h.01M14 14h.01" />
</>);

export const Salt = icon('Salt', <>
  <path d="M8 9a4 4 0 0 1 8 0v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1zM8 12.5h8M11 6.5h.01M13 6.5h.01M12 5h.01" />
</>);

export const Bacon = icon('Bacon', <>
  <path d="M3 8.5c3-3 5.5 3 9 0s6-3 9 0v6c-3-3-5.5-3-9 0s-6 3-9 0zM5.5 11.5c2-1.5 4 1.5 6.5 0s4.5-1.5 6.5 0" />
</>);

export const Sausage = icon('Sausage', <>
  <path d="M4 11a8 8 0 0 0 16 0M8 11a4 4 0 0 0 8 0M4 11a2 2 0 0 1 4 0M16 11a2 2 0 0 1 4 0M6 9V7M18 9V7" />
</>);

export const Tofu = icon('Tofu', <>
  <path d="M3 9l5-4h13l-5 4zM3 9v10h13V9M16 19l5-4V5" />
</>);

export const Chocolate = icon('Chocolate', <>
  <rect x="5" y="2" width="14" height="20" rx="2" />
  <path d="M12 2v12M5 8h14M5 14h14M5 18l2.3-1 2.3 1 2.4-1 2.3 1 2.4-1 2.3 1" />
</>);

export const Crisps = icon('Crisps', <>
  <path d="M6 3h12l-1.5 4 1.5 13-1 1H7l-1-1L7.5 7z" />
  <circle cx="12" cy="13" r="3" />
</>);

export const ToiletRoll = icon('ToiletRoll', <>
  <ellipse cx="8" cy="10" rx="4" ry="6" />
  <ellipse cx="8" cy="10" rx="1.2" ry="1.8" />
  <path d="M8 4h8c2.2 0 4 2.7 4 6s-1.8 6-4 6H8M14 16v5H8" />
</>);
