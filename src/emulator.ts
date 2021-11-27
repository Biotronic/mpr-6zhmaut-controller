import { plainToClass } from 'class-transformer';
import { Zone } from './model';


export const runEmulator = (numAmps: 1 | 2 | 3) => {
    const fs = require('fs');
    const SerialPort = require("serialport");
    const Readline = require('@serialport/parser-readline');
    const log = require("loglevel");

    const BaudRate = parseInt(process.env.BAUDRATE || "9600");
    const device = process.env.DEVICE || "COM5";
    const serial = new SerialPort(device, {
        baudRate: BaudRate,
    });
    const parser = serial.pipe(new Readline({ delimiter: "\n", encoding: "ascii" }));

    const writeSerial = (line) => {
        log.info("Emulator sent", line);
        serial.write(line+"\n");
    };
    
    let zones: Zone[] = [];
    
    for (let i = 1; i <= numAmps; ++i) {
        for (let j = 1; j <= 6; ++j) {
            let zone = zones[i*10 + j] = new Zone();
            zone.id = i*10 + j;
        }
    }
    
    
    const pad = (s: any): string => {
        return ("00"+(+s)).slice(-2);
    }
    
    const findZones = (id: string): Zone[] => {
        if (+id % 10 == 0) {
            return zones.filter(z => Math.floor(z.id / 10) == Math.floor(+id / 10));
        }
        return zones.filter(z => z.id == +id);
    };

    parser.on('data', function (data) {
        log.info("Emulator received: ", data);
        let zones = findZones(data.substring(1, 3));
        let attribute = data.substring(3, 5);
        let value = data.substring(5, 7);
        if (data.match(/^\?\d\d$/)) {
            for (let z of zones) {
                writeSerial(`>${pad(z.id)}${pad(z.pa)}${pad(z.power)}${pad(z.mute)}${pad(z.dnd)}${pad(z.volume)}${pad(z.treble)}${pad(z.bass)}${pad(z.balance)}${pad(z.source)}00`);
            }
        } else if (data.match(/^\?\d\d..$/)) {
            switch (attribute) {
                case 'PA': attribute = 'pa'; break;
                case 'PR': attribute = 'power'; break;
                case 'MU': attribute = 'mute'; break;
                case 'DT': attribute = 'dnd'; break;
                case 'VO': attribute = 'volume'; break;
                case 'TR': attribute = 'treble'; break;
                case 'BS': attribute = 'bass'; break;
                case 'BL': attribute = 'balance'; break;
                case 'CH': attribute = 'source'; break;
                default: return;
            }
            for (let z of zones) {
                writeSerial(pad(z[attribute]));
            }
        } else if (data.match(/^<\d\d..\d\d$/)) {
            switch (attribute) {
                case 'PA': attribute = 'pa'; break;
                case 'PR': attribute = 'power'; break;
                case 'MU': attribute = 'mute'; break;
                case 'DT': attribute = 'dnd'; break;
                case 'VO': attribute = 'volume'; break;
                case 'TR': attribute = 'treble'; break;
                case 'BS': attribute = 'bass'; break;
                case 'BL': attribute = 'balance'; break;
                case 'CH': attribute = 'source'; break;
                default: return;
            }
            for (let z of zones) {
                z[attribute] = value;
            }
        } else if (data.match(/^[1-6M]<........$/)) {
            writeSerial("Done.");
        } else {
            writeSerial("Command error.");
        }
    });
    serial.on("open", function () {
        console.log(`serial emulator running on port ${device}`);
    });
};