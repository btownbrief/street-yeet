// Church Street Marketplace, Pearl → Main. Storefront names and numbers come
// from the Marketplace's own directory (churchstmarketplace.com, Aug 2026):
// even numbers are the EAST side, odd the WEST, numbers climb north→south.
// Exact frontage widths and which side of a cross street a corner shop sits
// on are approximate — this is a love letter, not a survey.

// x: east(+)/west(−), z: south(+)/north(−). Street centreline is x=0.
export const STREET = {
  halfWidth: 9,          // building face to centreline (≈60 ft street)
  crossWidth: 14,
  blocks: [
    { name: 'Pearl → Cherry', z0: 7, z1: 107 },
    { name: 'Cherry → Bank', z0: 121, z1: 216 },
    { name: 'Bank → College', z0: 230, z1: 325 },
    { name: 'College → Main', z0: 339, z1: 444 },
  ],
  crosses: [
    { name: 'Pearl St', z: 0 },
    { name: 'Cherry St', z: 114 },
    { name: 'Bank St', z: 223 },
    { name: 'College St', z: 332 },
    { name: 'Main St', z: 451 },
  ],
  zNorth: -7, zSouth: 458,
};

// kinds: cafe | bar | shop | big | civic. a = awning colour (null = none), s = striped
const E = (number, name, opts = {}) => ({ side: 1, number, name, ...opts });
const W = (number, name, opts = {}) => ({ side: -1, number, name, ...opts });

export const ROSTER = [
  // ---- Block 1: Pearl → Cherry ----
  { block: 0, east: [
    E(2, 'Kru Coffee', { kind: 'cafe', a: '#1b1b1b', signBg: '#1b1b1b', signFg: '#f2e7cf' }),
    E(10, "E.B. Strong's", { kind: 'bar', a: '#1f4d3a', signBg: '#10261d', signFg: '#e9d7a3', font: '700 44px Georgia, serif' }),
    E(14, 'Crow Bookshop', { kind: 'shop', a: '#2a3f6b', signBg: '#f3ead6', signFg: '#1e2c4a', font: 'italic 700 44px Georgia, serif' }),
    E(16, "Halvorson's Upstreet Café", { kind: 'cafe', a: '#2f6b3a', s: true, signBg: '#173a1e', signFg: '#f5e9c8', joe: true, tables: true }),
    E(28, "Smugglers' Notch Distillery", { kind: 'bar', a: null, signBg: '#2b1b12', signFg: '#e8c27a', font: '700 40px Georgia, serif' }),
    E(32, 'Public Vintage', { kind: 'shop', a: '#6b3a8a', signBg: '#f5efe3', signFg: '#3b2a5a', font: '800 44px "Trebuchet MS", Arial' }),
    E(34, 'Daydream Art Supply', { kind: 'shop', a: '#e5a33a', signBg: '#fff6e2', signFg: '#b5481f' }),
  ], west: [
    W(21, "Tina's Home Design", { kind: 'shop', a: '#8a6f4e', signBg: '#f4ecdf', signFg: '#4a3a2a', font: 'italic 700 44px Georgia, serif' }),
    W(23, 'Underground Closet', { kind: 'shop', a: null, signBg: '#111', signFg: '#ffe36b', font: '900 42px "Arial Black", Impact' }),
    W(25, 'Urban Outfitters', { kind: 'big', a: null, signBg: '#f3f1ec', signFg: '#222', font: '700 40px "Helvetica Neue", Arial' }),
    W(29, '', { kind: 'plain' }),
    W(31, 'lululemon', { kind: 'shop', a: null, signBg: '#fafafa', signFg: '#c8102e', font: '700 44px "Helvetica Neue", Arial' }),
    W(33, 'Burlington Violin Shop', { kind: 'shop', a: '#5a2d1a', signBg: '#f6efe0', signFg: '#4a2a12', font: 'italic 700 40px Georgia, serif' }),
    W(35, 'CVS', { kind: 'big', a: null, signBg: '#cc0000', signFg: '#fff', font: '900 46px "Arial Black", Arial' }),
  ]},
  // ---- Block 2: Cherry → Bank ----
  { block: 1, east: [
    E(36, "Ben & Jerry's", { kind: 'cafe', a: '#3aa6d8', signBg: '#2b78b8', signFg: '#fff', font: '900 44px "Arial Black", Impact', cow: true, tables: true }),
    E(38, 'Whizbangs Candy Lab', { kind: 'shop', a: '#ff5fa2', s: true, signBg: '#fff0f6', signFg: '#d42a7a' }),
    E(40, 'PokeWorks', { kind: 'cafe', a: null, signBg: '#1d1d1d', signFg: '#ff7a59' }),
    E(46, 'Catamount Store', { kind: 'shop', a: '#0f6b3f', signBg: '#0f6b3f', signFg: '#f2c744', font: '900 42px "Arial Black", Arial' }),
    E(52, 'Homeport', { kind: 'big', a: '#6b1f1f', s: true, signBg: '#f5ecd9', signFg: '#6b1f1f', font: '700 44px Georgia, serif' }),
    E(56, 'Banana Republic', { kind: 'big', a: null, signBg: '#f7f5f0', signFg: '#222', font: '700 40px "Helvetica Neue", Arial' }),
    E(62, 'Whim Boutique', { kind: 'shop', a: '#d95a8f', signBg: '#fff4f8', signFg: '#9c2a5c', font: 'italic 700 44px Georgia, serif' }),
    E(70, 'Flora & Fauna', { kind: 'shop', a: '#3c6b3a', signBg: '#edf3e4', signFg: '#2a4a28', font: 'italic 700 44px Georgia, serif' }),
    E(72, 'Vermont Flannel Co.', { kind: 'shop', a: '#a8322b', s: true, signBg: '#2b1b14', signFg: '#f3d9a0', font: '900 40px "Arial Black", Arial' }),
    E(78, 'Karlise Fine Jewelers', { kind: 'shop', a: '#1b1b1b', signBg: '#111', signFg: '#e6d09a', font: '700 38px Georgia, serif' }),
    E(84, 'Insomnia Cookies', { kind: 'cafe', a: '#2a2a7a', signBg: '#1a1a5a', signFg: '#fff', font: '800 42px "Trebuchet MS", Arial' }),
    E(86, 'Saratoga Olive Oil', { kind: 'shop', a: '#6b8a2a', signBg: '#f5f2e0', signFg: '#4a5a1a', font: '700 40px Georgia, serif' }),
    E(88, 'Asiana Noodle Shop', { kind: 'cafe', a: '#b5332a', signBg: '#f7f3ea', signFg: '#222', font: '700 40px "Helvetica Neue", Arial' }),
    E(90, 'Free People', { kind: 'big', a: null, signBg: '#f5f0e6', signFg: '#3a2a1a', font: 'italic 700 42px Georgia, serif' }),
  ], west: [
    W(37, 'Outdoor Gear Exchange', { kind: 'big', a: '#2f6b3a', signBg: '#1f4a2a', signFg: '#f1e2a6', font: '900 40px "Arial Black", Arial', wide: 2 }),
    W(57, 'Zinnia', { kind: 'shop', a: '#e06b9a', signBg: '#fff5f9', signFg: '#a32a5a', font: 'italic 700 46px Georgia, serif' }),
    W(59, 'Hatley Boutique', { kind: 'shop', a: '#3a66b5', signBg: '#eef3fb', signFg: '#1f3a7a' }),
    W(61, 'Bertha Church', { kind: 'shop', a: '#7a1f3a', signBg: '#fdf3f6', signFg: '#7a1f3a', font: 'italic 700 44px Georgia, serif' }),
    W(63, 'Pepper Palace', { kind: 'shop', a: '#d9301f', signBg: '#d9301f', signFg: '#ffe36b', font: '900 42px "Arial Black", Arial' }),
    W(65, 'Lake Champlain Chocolates', { kind: 'cafe', a: '#4a2a1a', signBg: '#3b2314', signFg: '#f3d3a0', font: '700 38px Georgia, serif' }),
    W(71, "Ken's Pizza & Pub", { kind: 'bar', a: '#b5332a', s: true, signBg: '#2b1b14', signFg: '#ffd36b', font: '900 42px "Arial Black", Arial' }),
    W(75, 'Catamount Tobacco', { kind: 'shop', a: null, signBg: '#1b2b1b', signFg: '#d9c27a', font: '700 40px Georgia, serif' }),
    W(81, 'Ecco Clothes', { kind: 'shop', a: '#2a2a2a', signBg: '#f4f4f4', signFg: '#111', font: '700 44px "Helvetica Neue", Arial' }),
    W(83, 'Pascolo Ristorante', { kind: 'cafe', a: '#6b1f1f', signBg: '#f5ecd9', signFg: '#6b1f1f', font: 'italic 700 42px Georgia, serif', tables: true }),
    W(85, 'Frog Hollow', { kind: 'shop', a: '#3c6b3a', signBg: '#edf3e4', signFg: '#234a22', font: '700 44px Georgia, serif' }),
    W(87, 'Golden Hour Gift Co.', { kind: 'shop', a: '#e0a23a', signBg: '#fff6e2', signFg: '#8a5a12', font: 'italic 700 42px Georgia, serif' }),
    W(89, 'Phoenix Books', { kind: 'shop', a: '#c8102e', signBg: '#f6f1e6', signFg: '#c8102e', font: '700 44px Georgia, serif' }),
  ]},
  // ---- Block 3: Bank → College ----
  { block: 2, east: [
    E(92, 'Cappadocia Bistro', { kind: 'cafe', a: '#b5332a', signBg: '#f7eede', signFg: '#6b1f1f', font: '700 40px Georgia, serif' }),
    E(96, 'Harbour Thread', { kind: 'shop', a: '#2a3f6b', signBg: '#eef2f9', signFg: '#1f2f5a' }),
    E(98, 'FP Movement', { kind: 'shop', a: null, signBg: '#f7f3ec', signFg: '#222', font: '700 40px "Helvetica Neue", Arial' }),
    E(102, 'Kiss the Cook', { kind: 'shop', a: '#d9301f', s: true, signBg: '#fff', signFg: '#d9301f', font: '900 42px "Arial Black", Arial' }),
    E(104, 'Artemus Café', { kind: 'cafe', a: '#4a2a1a', signBg: '#2b1b14', signFg: '#f3d3a0', font: 'italic 700 42px Georgia, serif', tables: true }),
    E(106, 'Amberli', { kind: 'shop', a: '#e0a23a', signBg: '#fff8ea', signFg: '#8a5a12', font: 'italic 700 46px Georgia, serif' }),
    E(110, 'Tradewinds Imports', { kind: 'shop', a: '#3a8a8a', s: true, signBg: '#e9f5f5', signFg: '#1f5a5a' }),
    E(112, "Lippa's Jewelers", { kind: 'shop', a: '#1b1b1b', signBg: '#111', signFg: '#e6d09a', font: '700 40px Georgia, serif' }),
    E(120, 'Sweetwaters', { kind: 'bar', a: '#1f4d3a', signBg: '#173a2a', signFg: '#f0d89a', font: '700 46px Georgia, serif', wide: 1.6, tables: true }),
  ], west: [
    W(93, 'Burlington Bagel Bakery', { kind: 'cafe', a: '#e0a23a', signBg: '#fff6e2', signFg: '#7a4a12', font: '800 40px "Trebuchet MS", Arial' }),
    W(97, "Garcia's Tobacco", { kind: 'shop', a: null, signBg: '#2b1b14', signFg: '#d9c27a', font: '700 40px Georgia, serif' }),
    W(99, 'Little Istanbul', { kind: 'cafe', a: '#b5332a', s: true, signBg: '#f7eede', signFg: '#8a1f1f' }),
    W(101, '4T2D', { kind: 'shop', a: '#222', signBg: '#111', signFg: '#fff', font: '900 46px "Arial Black", Impact' }),
    W(103, 'Church Street Tavern', { kind: 'bar', a: '#1b1b1b', signBg: '#1b1b1b', signFg: '#e6c27a', font: '700 40px Georgia, serif', tables: true }),
    W(107, 'The Optical Center', { kind: 'shop', a: null, signBg: '#f4f4f4', signFg: '#222', font: '700 40px "Helvetica Neue", Arial' }),
    W(111, 'Danforth Pewter', { kind: 'shop', a: '#6b6b6b', signBg: '#f1f1ee', signFg: '#333', font: '700 42px Georgia, serif' }),
    W(113, 'Vermont Gem Lab', { kind: 'shop', a: '#3a66b5', signBg: '#eef3fb', signFg: '#1f3a7a' }),
    W(115, "Leunig's Bistro", { kind: 'bar', a: '#6b1f2a', signBg: '#3a1118', signFg: '#f2d9a8', font: 'italic 700 46px Georgia, serif', wide: 1.8, tables: true }),
  ]},
  // ---- Block 4: College → Main ----
  { block: 3, east: [
    E(126, 'Global Pathways', { kind: 'shop', a: '#3c6b3a', signBg: '#edf3e4', signFg: '#234a22' }),
    E(128, 'Maven', { kind: 'shop', a: null, signBg: '#f7f3ec', signFg: '#222', font: '700 46px "Helvetica Neue", Arial' }),
    E(130, 'Country Roads Jamaican Flair', { kind: 'cafe', a: '#2f8a3a', s: true, signBg: '#ffd700', signFg: '#1f6b2a', font: '900 36px "Arial Black", Arial' }),
    E(132, 'True 802', { kind: 'shop', a: null, signBg: '#1b1b1b', signFg: '#7ad47a', font: '900 44px "Arial Black", Arial' }),
    E(134, "Akes' Place", { kind: 'bar', a: '#1b1b1b', signBg: '#111', signFg: '#f0c040', font: '700 44px Georgia, serif' }),
    E(136, 'Red Square', { kind: 'bar', a: '#b5121b', signBg: '#8a0f16', signFg: '#fff', font: '900 46px "Arial Black", Impact', tables: true }),
    E(144, 'Gaku Ramen', { kind: 'cafe', a: '#1b1b1b', signBg: '#111', signFg: '#ff5a3a', font: '800 44px "Trebuchet MS", Arial' }),
    E(146, 'Laliguras', { kind: 'cafe', a: '#d9301f', signBg: '#fff3ea', signFg: '#b5331a', font: '700 42px Georgia, serif' }),
    E(156, 'Honey Road', { kind: 'cafe', a: '#e0a23a', signBg: '#f9efd8', signFg: '#5a3a12', font: 'italic 700 46px Georgia, serif', wide: 1.5, tables: true }),
  ], west: [
    W(117, 'MK Clothing', { kind: 'shop', a: null, signBg: '#111', signFg: '#fff', font: '700 44px "Helvetica Neue", Arial' }),
    W(123, 'Rí Rá Irish Pub', { kind: 'bar', a: '#1f4d3a', signBg: '#0f3a22', signFg: '#e9d7a3', font: '700 44px Georgia, serif', wide: 1.6 }),
    W(131, "Von Bargen's", { kind: 'shop', a: '#1b1b1b', signBg: '#111', signFg: '#e6d09a', font: '700 42px Georgia, serif' }),
    W(135, 'BCA Center', { kind: 'civic', landmark: 'firehouse', wide: 1.6 }),
    W(149, 'City Hall', { kind: 'civic', landmark: 'cityhall', wide: 3 }),
  ]},
];

// Burlington-flavoured yelps when someone gets yeeted
export const YELPS = {
  leafPeeper: ['I drove up from Connecticut for THIS?', 'Is this a Vermont thing?', 'My foliage pics!!'],
  uvmStudent: ['Bro I have a midterm.', 'GO CATS… oof.', 'Is this a Church St thing?'],
  phishFan: ['Whoa, man.', 'That was… a trip.', 'Tell Trey I love him.'],
  flannelGuy: ['Not the flannel!', 'Ope.', 'Welp.'],
  creemeeKid: ['MY CREEMEE!', 'I want a maple one!', 'Wheeee!'],
  busker: ['I was mid-set, dude.', 'Tip jar, please.', 'That was my encore.'],
  lunchWalker: ["I'm on my lunch!", 'Back to the office then.', 'Unbelievable.'],
  hockeyDad: ["That's a penalty!", 'Two minutes for YEETING.', 'Ref!'],
  mittensGuy: ['I am once again… on the ground.', 'My mittens!', 'Not today.'],
  yogaPerson: ['Namaste… down here.', 'Very grounding.', 'Breathe in… ow.'],
  skater: ['Sick.', 'Bail!', 'Do it again.'],
  syrupSeller: ['Grade A yeet.', 'My syrup!', 'Sweet mother of maple.'],
};
