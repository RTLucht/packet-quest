// All tunable numbers live here.
(function () {
  'use strict';
  const PQ = window.PQ;

  // Economy numbers adopted from Grok's design brief (docs/grok-design-brief.md).
  PQ.CFG = {
    // Ticket economy: raw = floor(base * levelMult * urgencyMult)
    urgency: {
      green: { mult: 1.0, sla: 150 },
      yellow: { mult: 1.25, sla: 110 },
      red: { mult: 1.5, sla: 85 },
    },
    levelMult: [1, 1.5, 2],
    urgencyWeights: { 1: [50, 35, 15], 2: [30, 40, 30], 3: [15, 35, 50] }, // green/yellow/red by level
    speedBonusMax: 0.5,    // bonus = floor(raw * slaLeft/sla * 0.5)
    blownMult: 0.5,        // blown SLA pays floor(raw * 0.5), no bonus
    dnsPay: 1,             // "It was DNS" pays exactly 1 TD
    dnsAfter: 20,          // seconds before the hidden dns button appears
    ccieMult: 1.1,
    chainEvery: 3,         // every 3rd clean close in a row pays x1.25
    chainMult: 1.25,
    queueSize: 4,
    queueRefill: 12,       // seconds per new ticket in queue
    lives: 3,
    burnoutTax: 0.1,

    // missions unlocked by cert level (0 = none, 1 = CCNA, 2 = CCNP, 3 = CCIE)
    missionsByCert: [['cable', 'vlan'], ['ap', 'config'], ['tracer', 'rogue'], ['stp']],

    // On-call pager
    pagerChance: 0.3,
    pagerBonus: 5,
    pagerPenalty: 15,
    pagerSites: ['P1: ED badge readers down', 'P2: Pharmacy label printer', 'P1: MRI VLAN flapping', 'P3: Guest Wi-Fi slow', 'P1: Core link CRC errors', 'P2: Nurse call system offline'],

    // Ranks by lifetime Tech$$$ earned (Principal also needs The Great Outage beaten)
    ranks: [
      { name: 'Tier 1 Tech', at: 0 },
      { name: 'Field Engineer', at: 150 },
      { name: 'Network Engineer', at: 450 },
      { name: 'Senior Engineer', at: 900 },
      { name: 'Architect', at: 1500 },
      { name: 'Principal of the Packet Realm', at: 2500 },
    ],

    shop: [
      { id: 'reach', name: 'CONSOLE CABLE +2 REACH', price: 40, desc: 'Use doors from further away. Bigger zap.' },
      { id: 'mug', name: 'COFFEE MUG', price: 15, desc: 'C = full stamina. Stacks to 3.' },
      { id: 'label', name: 'GOLDEN LABEL MAKER', price: 120, desc: 'Closed sites get documented: +25% pay there. The Auditor cares.' },
      { id: 'cert1', name: 'CERT SCROLL: CCNA', price: 80, desc: 'Unlocks AP Placement and Config Commit tickets.' },
      { id: 'cert2', name: 'CERT SCROLL: CCNP', price: 200, desc: 'Unlocks TTL Run and Rogue AP tickets.' },
      { id: 'cert3', name: 'CERT SCROLL: CCIE', price: 400, desc: 'Unlocks Spanning Tree Siege (100 T$). +10% pay. Needed for The Great Outage.' },
      { id: 'drone', name: 'AI SIDEKICK DRONE', price: 500, desc: '3 charges. D on a mission intro = auto-solve.' },
      { id: 'hat', name: 'HARD HAT', price: 25, desc: 'Cosmetic. Safety first.' },
      { id: 'vest', name: 'HI-VIS VEST', price: 40, desc: 'Cosmetic. Visible from the parking lot.' },
      { id: 'tee', name: '"I SURVIVED THE MIGRATION" TEE', price: 75, desc: 'Legendary cosmetic.' },
    ],

    // Bosses: phases are [minigameId, level|'boss'] run through the normal host.
    bosses: {
      loop: { name: 'THE LOOPMASTER', site: 'branch', reward: 100, phases: [['stp', 2], ['stp', 'boss'], ['cable', 'boss']],
        taunt: 'A broadcast storm hydra. Every head is a loop.', need: 'FIELD ENGINEER + 3 WORLD-1 CLOSES' },
      bgp: { name: 'LORD BGP FLAP', site: 'dc', reward: 200, phases: [['tracer', 2], ['vlan', 'boss'], ['tracer', 'boss']],
        taunt: 'I withdraw my routes... mid-fight!', need: 'LOOPMASTER DOWN + NETWORK ENGINEER + CCNA' },
      auditor: { name: 'THE AUDITOR', site: 'tower', reward: 350, phases: [['config', 'boss'], ['docs', 3], ['ap', 'boss']],
        taunt: 'Show me the documentation.', need: 'BGP FLAP DOWN + SENIOR ENGINEER + CCNP' },
      outage: { name: 'THE GREAT OUTAGE', site: 'noc', reward: 1000, lateReward: 400,
        taunt: '2,200 sites. All at once. Triage or perish.', need: 'ALL 3 BOSSES + ARCHITECT + CCIE' },
    },
    // Great Outage triage cards: board timers keep running while you play another card.
    outageCards: [
      { name: 'REMOTE CLOSET', game: 'cable', level: 2, timer: 70 },
      { name: 'CLINIC', game: 'vlan', level: 1, timer: 120 },
      { name: 'DATA CENTER', game: 'tracer', level: 1, timer: 170 },
      { name: 'CAMPUS', game: 'config', level: 1, timer: 230 },
    ],

    // Loading-screen tips (Grok, fact-checked by Claude)
    tips: [
      'Ethernet has no TTL. A switching loop floods until STP blocks a port.',
      'STP root is the lowest bridge ID: priority first, then MAC address.',
      'PortFast skips Listening and Learning. Never face it toward a switch.',
      'BPDU Guard err-disables a port that receives a BPDU. Pair it with PortFast.',
      'A VLAN is one broadcast domain. Other VLANs need a router to talk.',
      'An access port carries one untagged VLAN. A trunk carries many, tagged.',
      'Voice VLAN: a second, tagged VLAN on an access port for the phone.',
      '802.1Q adds 4 bytes. A max-size frame grows from 1518 to 1522 bytes.',
      'Native VLAN frames are untagged. Mismatch it and traffic leaks.',
      'ACL wildcards are inverted. 0.0.0.255 matches any last octet.',
      'Longest prefix match wins. A /32 beats a /24 beats 0.0.0.0/0.',
      'ip default-gateway is for the switch itself, not the hosts behind it.',
      'OSPF router-id: manual if set, else highest loopback, else highest IP.',
      'Cisco BGP checks weight, then local preference, before AS-path length.',
      'iBGP does not re-advertise iBGP routes. Hence route reflectors.',
      'DHCP Discover is a broadcast. Cross-VLAN needs ip helper-address.',
      'ARP maps IPv4 to MAC on the local subnet only. It stops at the router.',
      'Hosts should gateway to the HSRP/VRRP virtual IP, not a physical IP.',
      'In 2.4 GHz, channels 1, 6 and 11 are the non-overlapping 20 MHz set.',
      'A rogue AP is a radio you do not control, whatever SSID it copies.',
      'SNMP v2c is cleartext. "public" is a default, not a secret.',
      'Telnet sends passwords in cleartext. Use SSH for management.',
      'Duplex mismatch: CRC errors plus late collisions on the half side.',
      'Hard-set speed facing auto often fails. Set both ends the same.',
      'PAT hides many hosts behind one public IP by rewriting source ports.',
      'Ping blocked by an ACL does not mean the host is down.',
      'Small pings work but apps hang? Suspect MTU. Test with DF-bit pings.',
      'A /31 is valid on point-to-point links (RFC 3021).',
      'DNS TTL is in seconds. Fix the record and caches still hold the old one.',
      'Err-disable is the switch protecting you. Read why, then shut/no shut.',
    ],

    // Ticket flavor (what the user said) and close lines (what you learned), by mission
    flavor: {
      cable: ['Half the ED lost network after the cleaners came through', 'Someone "tidied" the IDF', 'Patch panel looks like spaghetti'],
      ap: ['Wi-Fi dies in the ICU near the nurse station', 'Doctors walk to the hallway to get signal', 'New wing opened, no coverage'],
      vlan: ['IV pumps landed on the guest network', 'New devices need to go in the right VLAN', 'Phones are on the data VLAN again'],
      tracer: ['Packets to the EHR server are timing out', 'Traceroute dies after hop 4', 'Users say the app is "slow-ish"'],
      config: ['Change request CR-4471 ready to commit', 'Peer review needed before the window closes', 'Junior pushed a config from Notepad'],
      rogue: ['Unknown SSID "FreeHospitalWiFi" detected', 'WIPS alarm: rogue AP on the wired LAN', 'Someone plugged in a home router'],
      stp: ['Broadcast storm! Every switch light is solid', 'Someone looped a cable under a desk', 'CPU 100% on every access switch'],
    },
    closeLines: {
      cable: ['Label both ends. Future you says thanks.', 'A clean closet is a cool closet.'],
      ap: ['Walls eat signal. Concrete eats more.', 'More APs at lower power beats one loud AP.'],
      vlan: ['Trust the device, not the sticky note.', 'Guests never belong on the data VLAN.'],
      tracer: ['TTL hits zero, the packet dies. Loops kill.', 'Every hop decrements TTL by one.'],
      config: ['Peer review catches what autocorrect cannot.', 'show run | diff before you commit.'],
      rogue: ['Signal gets stronger as you get closer.', 'Port security would have stopped that.'],
      stp: ['A tree with N switches has N-1 links.', 'Blocked ports are not broken. They are STP.'],
    },
  };

  PQ.rankOf = function (earned) {
    let r = 0;
    PQ.CFG.ranks.forEach((rk, i) => { if (earned >= rk.at) r = i; });
    const last = PQ.CFG.ranks.length - 1;
    if (r === last && !(PQ.state && PQ.state.bosses.outage)) r = last - 1;
    return r;
  };

  PQ.TRACKS = {
    title: {
      bpm: 132, drums: true,
      lead: ['E5', '-', 'G5', 'B5', '-', 'A5', 'G5', 'E5', 'D5', '-', 'E5', 'G5', '-', '-', '-', '-',
        'E5', '-', 'G5', 'B5', '-', 'D6', 'C6', 'B5', 'A5', '-', 'G5', 'A5', 'B5', '-', '-', '-'],
      bass: ['E3', '-', 'E3', '-', 'E3', '-', 'E3', '-', 'C3', '-', 'C3', '-', 'D3', '-', 'D3', '-'],
    },
    overworld: {
      bpm: 120, drums: true,
      lead: ['C5', 'E5', 'G5', 'E5', 'A5', '-', 'G5', '-', 'F5', 'E5', 'D5', 'E5', 'C5', '-', '-', '-',
        'C5', 'E5', 'G5', 'C6', 'B5', '-', 'A5', '-', 'G5', 'F5', 'E5', 'D5', 'C5', '-', '-', '-'],
      bass: ['C3', '-', 'G3', '-', 'A2', '-', 'E3', '-', 'F2', '-', 'C3', '-', 'G2', '-', 'G3', '-'],
    },
    minigame: {
      bpm: 156, drums: true,
      lead: ['A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'C5', 'E5', 'F4', 'A4', 'C5', 'F5', 'E5', 'C5', 'A4', 'C5'],
      bass: ['A2', '-', 'A2', 'A3', 'A2', '-', 'A2', 'A3', 'F2', '-', 'F2', 'F3', 'G2', '-', 'G2', 'G3'],
    },
    boss: {
      bpm: 170, drums: true,
      lead: ['E5', 'E5', 'F5', 'E5', 'D#5', 'E5', '-', 'B4', 'C5', 'C5', 'D5', 'C5', 'B4', 'A4', '-', 'B4'],
      bass: ['E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'E2', 'E3', 'C2', 'C3', 'C2', 'C3', 'B1', 'B2', 'B1', 'B2'],
    },
    shop: {
      bpm: 100,
      lead: ['G4', '-', 'B4', 'D5', 'G5', '-', 'F#5', '-', 'E5', '-', 'C5', 'E5', 'D5', '-', '-', '-'],
      bass: ['G2', '-', 'D3', '-', 'C3', '-', 'G2', '-', 'C3', '-', 'A2', '-', 'D3', '-', 'D3', '-'],
    },
  };
})();
