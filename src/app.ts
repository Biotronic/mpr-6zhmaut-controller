import 'reflect-metadata';
import 'source-map-support/register'
import express from "express";
import { plainToClass } from 'class-transformer';
import { Zone, Source, Scenario, Ramp } from './model';

const sass = require('sass');
const fs = require('fs');
const SerialPort = require("serialport");
const Readline = require('@serialport/parser-readline');

const AmpCount = process.env.AMPCOUNT || 1;
const BaudRate = parseInt(process.env.BAUDRATE || "9600");
const device = process.env.DEVICE || "COM4";
const serial = new SerialPort(device, {
    baudRate: BaudRate,
});
const app = express();
app.use(express.json());
const port = 3000;
const rampInterval = parseInt(process.env.RAMPTIME || "250");
const parser = serial.pipe(new Readline({ delimiter: "\n", encoding: "ascii" }));

const writeSerial = (line) => {
    console.log('serial: ', line);
    serial.write(line);
};

parser.on('data', function (data) {
    console.log("parser.on('data'): ", data);
    if (data.startsWith('Command Error.')) {
        process.exit(1);
    }
    const zone = data.toString("ascii").match(/>(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (zone != null) {
        zones[zone[1]] = {
            "id":          parseInt(zone[1]),
            "name":        "Name",
            "description": "",
            "pa":          zone[2] == "01",
            "power":       zone[3] == "01",
            "mute":        zone[4] == "01",
            "dnd":         zone[5] == "01",
            "volume":      parseInt(zone[6]),
            "treble":      parseInt(zone[7]),
            "bass":        parseInt(zone[8]),
            "balance":     parseInt(zone[9]),
            "source":      parseInt(zone[10])
        };
        fs.writeFileSync('src/zones.json', JSON.stringify(zones, null, 4));
    }
});
const readZones = () => {
    console.log(`reading zones from ${AmpCount} amps`);
    for (let amp = 1; amp <= AmpCount; ++amp) {
        console.log(`Querying amp ${amp}...`);
        writeSerial(`?${amp}0\n`);
    }
}
serial.on("open", function () {
    console.log("serial.on('open')");
    readZones();
});

function set(obj: any, attribute: string, value: any): any {
    console.log("set(", obj, ", ", attribute, ", ", value, ")");
    obj[attribute] = value;
    return obj;
}

let zones: Zone[]         = JSON.parse(fs.readFileSync('src/zones.json'    )).map(x => plainToClass(Zone,     x));
let sources: Source[]     = JSON.parse(fs.readFileSync('src/sources.json'  )).map(x => plainToClass(Source,   x));
let scenarios: Scenario[] = JSON.parse(fs.readFileSync('src/scenarios.json')).map(x => plainToClass(Scenario, x));

function pad(s: any): string {
    return ("00"+s).slice(-2);
}

function sanitizeName(name: string): string {
    // TODO
    return "test    ";
}

function writeAttribute(id: number, attribute: string, value: any) {
    switch (attribute) {
        case "pa":
            writeSerial(`<${id}PA${value ? "01" : "00"}\n`);
            break;
        case "power":
            writeSerial(`<${id}PR${value ? "01" : "00"}\n`);
            break;
        case "mute":
            writeSerial(`<${id}MU${value ? "01" : "00"}\n`);
            break;
        case "dnd":
            writeSerial(`<${id}DT${value ? "01" : "00"}\n`);
            break;
        case "volume":
            writeSerial(`<${id}VO${pad(value)}\n`);
            break;
        case "treble":
            writeSerial(`<${id}TR${pad(value)}\n`);
            break;
        case "bass":
            writeSerial(`<${id}BS${pad(value)}\n`);
            break;
        case "balance":
            writeSerial(`<${id}BL${pad(value)}\n`);
            break;
        case "source":
            writeSerial(`<${id}CH${pad(value)}\n`);
            break;
    }
    zones[id][attribute] = value;
}

function updateZones(delta: Partial<Zone>[]) {
    for (let dZone of delta) {
        for (let attribute in dZone) {
            writeAttribute(dZone.id, attribute, dZone[attribute]);
        }
        Object.assign(getZone(dZone.id));
    }
    fs.writeFileSync('src/zones.json', JSON.stringify(zones, null, 4));
}

function updateSources(delta: Partial<Source>[]) {
    for (let dSource of delta) {
        if (dSource["name"] !== undefined) {
            writeSerial(`${dSource.id}<${sanitizeName(dSource.name)}\n`);
        }
        Object.assign(getSource(dSource.id), dSource);
    }
    fs.writeFileSync('src/sources.json', JSON.stringify(sources, null, 4));
}

function updateScenarios(delta: Partial<Scenario>[]) {
    for (let dScenario of delta) {
        Object.assign(getScenario(dScenario.id), dScenario);
    }
    fs.writeFileSync('src/scenarios.json', JSON.stringify(scenarios, null, 4));
}

function getZone(id: number): Zone {
    return zones.find(z => z?.id == id);
}

function getSource(id: number): Source | Error {
    return sources.find(s => s?.id == id) || new Error(`Source not found: ${id}`);
}

function getScenario(id: number): Scenario | Error {
    return scenarios.find(s => s?.id == id) || new Error(`Scenario not found: ${id}`);
}

function paramRegex(param: string, regex: RegExp, fn: () => { id:number }[] = null) {
    app.param(param, (req, res, next, value) => {
        if (value.match(regex)) {
            if (req.method == "GET" && fn !== null && !fn().find(x => x && x.id == value)) {
                next(new Error(`${param} with id ${value} not found`));
            } else {
                next();
            }
        } else {
            next(new Error(`Invalid ${param}: ${value}`));
        }
    });
}

paramRegex('zone',      /^[1-3][0-6]$/, () => zones);
paramRegex('attribute', /^(pa|power|mute|dnd|volume|treble|bass|balance|source)$/);
paramRegex('source',    /^0[0-6]$/, () => sources);
paramRegex('scenario',  /^\d+$/, () => scenarios);


let ramps: Map<string, Ramp> = new Map<string, Ramp>();
function startRamp(ramp: Ramp) {
    let key = ramp.zone+ramp.attribute
    let existing = ramps.has(key);
    ramps.set(key, ramp);
    if (existing) {
        console.log(`No start ramp ${key}: already exist!`);
        return;
    }
    console.log(`Started ramp: ${key}`);
    let timer = setInterval(() => {
        ramp = ramps.get(key);
        if (!ramp || !ramp.enabled || ramp.next < 0 || (ramp.next > ramp.target && ramp.step > 0)) {
            clearInterval(timer);
            ramps.delete(key);
            return;
        }
        if (ramp.next == ramp.target) {
            ramp.enabled = false;
        }
        writeAttribute(ramp.zone, ramp.attribute, ramp.next);
        ramp.next += ramp.step;
    }, rampInterval);
}
function stopRamp(ramp: Ramp) {
    let r = ramps.get(ramp.zone+ramp.attribute);
    if (r) {
        r.enabled = false;
    }
}


///////////////////////////////////////////////////////////////////////////////
///  Zones
///////////////////////////////////////////////////////////////////////////////
app.get('/api/zones', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.json(zones.filter(z => z));
});
app.get('/api/zones/:zone', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.json(getZone(parseInt(req.params.zone)));
});
app.get('/api/zones/:zone/:attribute', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});

app.post('/api/zones/reload', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    zones = [];
    readZones();
    res.json(zones.filter(z => z));
});
app.post('/api/zones', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    updateZones(req.body);
    res.json(zones.filter(z => z));
});
app.post('/api/zones/:zone', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    console.log(req.body);
    updateZones([set(req.body, "id", req.params.zone)]);
    res.json(getZone(parseInt(req.params.zone)));
});
app.post('/api/zones/:zone/:attribute', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    updateZones([set({ id: req.params.zone }, req.params.attribute, req.body)]);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/up', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    let old = getZone(parseInt(req.params.zone))[req.params.attribute];
    updateZones([set({ id: req.params.zone }, req.params.attribute, old + (req.body || 1))]);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/down', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    let old = getZone(parseInt(req.params.zone))[req.params.attribute];
    updateZones([set({ id: req.params.zone }, req.params.attribute, old - (req.body || 1))]);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/rampup', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    let current = getZone(parseInt(req.params.zone))[req.params.attribute];
    let ramp = {
        zone: parseInt(req.params.zone),
        attribute: req.params.attribute,
        next: current + 1,
        step: 1,
        target: 100,
        enabled: true
    };
    switch (req.params.attribute) {
        case "volume":
            ramp.target = 38;
            break;
        case "treble":
            ramp.target = 14;
            break;
        case "bass":
            ramp.target = 14;
            break;
        case "balance":
            ramp.target = 20;
            break;
    }
    startRamp(ramp);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/rampdown', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    let current = getZone(parseInt(req.params.zone))[req.params.attribute];
    let ramp = {
        zone: parseInt(req.params.zone),
        attribute: req.params.attribute,
        next: current - 1,
        step: -1,
        target: 0,
        enabled: true
    };
    startRamp(ramp);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/rampstop', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    let ramp = {
        zone: parseInt(req.params.zone),
        attribute: req.params.attribute,
        next: 0,
        step: 0,
        target: 0,
        enabled: false
    };
    stopRamp(ramp);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/source/next', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    let old = getZone(parseInt(req.params.zone)).source;
    for (let i = 1; i <= 6; ++i) {
        let idx = (old + i - 1) % 6 + 1;
        if (sources[idx].enabled) {
            updateZones([{ id: parseInt(req.params.zone), source: idx }]);
            res.json(idx);
            break;
        }
    }
});
app.post('/api/zones/:zone/source/previous', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    let old = getZone(parseInt(req.params.zone)).source;
    for (let i = 0; i < 6; ++i) {
        let idx = (old + 6 - i - 1) % 6 + 1;
        if (sources[idx].enabled) {
            updateZones([{ id: parseInt(req.params.zone), source: idx }]);
            res.json(idx);
            break;
        }
    }
});


///////////////////////////////////////////////////////////////////////////////
///  Sources
///////////////////////////////////////////////////////////////////////////////
app.get('/api/sources', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.json(sources.filter(z => z));
});
app.get('/api/sources/:source', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.json(getSource(parseInt(req.params.source)));
});
app.post('/api/sources', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    updateSources(req.body);
    res.json(sources.filter(z => z));
});
app.post('/api/sources/:source', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    updateSources([set(req.body, "id", parseInt(req.params.source))]);
    res.json(getSource(parseInt(req.params.source)));
});



///////////////////////////////////////////////////////////////////////////////
///  Scenarios
///////////////////////////////////////////////////////////////////////////////
app.get('/api/scenarios', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.json(scenarios.filter(z => z));
});
app.get('/api/scenarios/:scenario', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    res.json(getScenario(parseInt(req.params.scenario)));
});
app.post('/api/scenarios', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    updateScenarios(req.body);
    res.json(scenarios.filter(z => z));
});
app.post('/api/scenarios/:scenario', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    updateScenarios([set(req.body, "id", parseInt(req.params.scenario))]);
    res.json(getScenario(parseInt(req.params.scenario)));
});
app.post('/api/scenarios/:scenario/engage', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    let scenario = getScenario(parseInt(req.params.scenario));
});
app.delete('/api/scenarios/:scenario', (req, res) => {
    console.log(`${req.method} ${req.url}`);
    scenarios = scenarios.filter(s => s.id != parseInt(req.params.scenario));
    res.json(scenarios);
});

app.listen(port, () => {
    return console.log(`server is listening on ${port}`);
});