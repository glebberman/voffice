/**
 * Цвета процедурного рендера карты: пол (в т.ч. зонный), стены, двери.
 * Мебель рисуется спрайтами предметов, здесь только фон под ними. Общие для
 * игровой сцены и Pixi-поля редактора — чтобы карта в редакторе выглядела
 * ровно как в игре.
 */
export const COLORS = {
    floor: 0xede7dc,
    floorAlt: 0xe7e0d3,
    wall: 0x4a4458,
    wallTop: 0x5d5570,
    kitchenFloor: 0xdce8e4,
    meetingCarpet: 0xdce0f0,
    loungeRug: 0xf2ddd0,
    zoneLabel: 0x6b6478,
    spotlightFloor: 0xf4e9c8,
    spotlight: 0xffe08a,
    doorFrame: 0x6b6478,
    door: 0xa9714b,
    doorLocked: 0x8f5a5a,
    doorKnob: 0xf0e6d2,
    doorLockedKnob: 0xffd166,
};
