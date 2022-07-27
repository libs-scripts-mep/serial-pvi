class SerialPVI {
   constructor(Baud = 9600, Parity = 0, ComPort = null) {
      this.BAUD = Baud
      this.COMPORT = ComPort
      this.PARIDADE = Parity
   }

   setPortCom(ComPort) {
      this.COMPORT = ComPort
   }

   getComPort() {
      return this.COMPORT
   }

   open(com = this.COMPORT, baud = this.BAUD, paridade = this.PARIDADE) {
      return pvi.runInstruction("serial.open", ['"' + com + '"', '"' + baud + '"', '"' + paridade + '"']) == 1
   }

   close(com = this.COMPORT) {
      return pvi.runInstruction("serial.close", ['"' + com + '"']) == 1
   }

   isOpen(com = this.COMPORT) {
      return pvi.runInstruction("serial.isopen", ['"' + com + '"']) == 1
   }

   ReadData(port = this.COMPORT, log = true) {
      let buffer = DAQ.runInstructionS("serial.readbytedata", [port])
      if (log) {
         console.log(`%cPVI <= ${buffer}`, 'color: #FF9900')
      }
      return buffer
   }

   SendData(DataSend, porta = this.COMPORT, log = true) {
      if (log) {
         console.log(`%cPVI => ${DataSend}`, 'color: #00CCCC')
      }
      return DAQ.runInstructionS("serial.sendbyte", [porta, DataSend])
   }

   /**
    * @returns array de portas COM encontradas pelo PVI
    */
   getPortList() {
      return DAQ.runInstructionS("serial.getportscsv", []).split(";")
   }

   //#region Métodos Estáticos

   //#region Estruturas Auxiliares

   /**
    * @param {Array} ByteArray 
    * @param {RegExp} regex Expressão regular para validar o formato (outra série de bytes)
    * @param {CRC} CRC Classe CRC desejada (CRC8, CRC16 etc...)
    * @param {Boolean} inv Inversão dos bytes do CRC
    * @returns string de requisição
   */
   byteArrayToStringReq(ByteArray, regex = null, CRC = null, inv = false) {

      let stringReq = ""
      let bufferString = ""

      ByteArray.forEach((byte, key, array) => {

         bufferString += byte

         if (key < array.length - 1) {
            bufferString += " "
         }
      })

      if (CRC != null) {
         let crc = CRC.Calculate(ByteArray, inv)
         bufferString += " " + crc
      }

      if (regex != null) {
         if (bufferString.match(regex)) {
            stringReq = bufferString
         } else {
            console.error("Formato da requisição inválido!")
         }
      } else {
         stringReq = bufferString
      }

      return (stringReq)
   }

   /**
    * Procura a porta COM de um dispositivo específico através de uma estrutura de requisição e resposta.
    * @param {string} dataSend Série de bytes a serem enviados
    * @param {RegExp} regex Expressão regular para validar a RESPOSTA (outra série de bytes)
    * @param {function} callback 
    * @param {number} timeOut 
    */
   getConnectedPortCom = (dataSend, regex, callback, timeOut = 1000) => {

      var portList = this.getPortList()
      let indexPort = 0

      let getPort = setInterval(() => {

         if (indexPort < portList.length) {

            var portaAtual = portList[indexPort]

            if (this.open(portaAtual, this.BAUD, this.PARIDADE) == 1) {

               if (this.SendData(dataSend, portaAtual) == 1) {

                  setTimeout(() => {

                     var byteData = this.ReadData(portaAtual).match(regex)

                     if (byteData) {

                        console.log(`%c${portaAtual} Match: ${byteData}`, `color: #00EE66`)
                        this.setPortCom(portaAtual)
                        clearInterval(getPort)
                        callback(true, this.getComPort())

                     } else {

                        console.log(`%c${portaAtual} Unmatch: ${byteData}`, `color: #EE0066`)
                        this.close(portaAtual)
                        indexPort++

                     }
                  }, timeOut * 0.5)

               } else {
                  console.log(`%c${portaAtual} Não foi capaz de enviar requisição`, `color: #EE0066`)
                  this.close(portaAtual)
                  indexPort++
               }

            } else {
               console.log(`%c${portaAtual} Não foi capaz de abrir porta COM`, `color: #EE0066`)
               this.close(portaAtual)
               indexPort++
            }

         } else {
            console.log(`%c$Fim da lista: dispositivo não respondeu.`, `color: #EE0066`)
            clearInterval(getPort)
            callback(false, "null")
         }

      }, timeOut)
   }

   //#endregion Estruturas Auxiliares

   /**
    * Varre todas as portas COM encontradas pelo PVI, e as fecha.
    */
   static closeAllPorts() {
      let ports = DAQ.runInstructionS("serial.getportscsv", []).split(";")
      ports.forEach(port => {
         console.log(`Fechando porta ${port}: `, pvi.runInstruction("serial.close", ['"' + port + '"']) == 1)
      })
   }

   static ConvertAscii(hex) {
      hex = hex.match(/[0-9A-Fa-f]*/g).filter(function (el) {
         return el != ""
      })
      hex = hex.map(function (item) {
         return parseInt(item, 16)
      })
      let bytes = new Uint8Array(hex)
      return new TextDecoder("ASCII", { NONSTANDARD_allowLegacyEncoding: true }).decode(bytes)
   }

   static BinaryToHex(d) {
      try {
         let hex = Number(parseInt(d, 2)).toString(16)
         hex = hex.toUpperCase()
         while (hex.length < 4) {
            hex = "0" + hex
         }
         return hex.substring(0, 2) + " " + hex.substring(2)
      } catch (error) {
         console.error("Erro ao converter binario para hexadecimal")
      }
   }

   static DecimalToHex(d) {
      try {
         let hex = Number(parseInt(d)).toString(16)
         hex = hex.toUpperCase()
         while (hex.length < 4) {
            hex = "0" + hex
         }
         return hex.substring(0, 2) + " " + hex.substring(2)
      } catch (error) {
         console.error("Erro ao converter decimal para hexadecimal")
      }
   }

   static HextoDecimal(d) {
      try {
         return Number.parseInt("0x" + d.replace(/[\t ]/g, ''))
      } catch (error) {
         console.error("Erro ao converter hexadecimal para decimal")
      }

   }

   static hex2bin(hex) {
      try {
         return (parseInt(hex, 16).toString(2)).padStart(8, '0')
      } catch (error) {
         console.error("Erro ao converter hexadecimal para binario")
      }
   }

   //#endregion Métodos Estáticos
}