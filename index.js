var https = require('https');
var http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const nodemailer = require('nodemailer');
const StringDecoder = require('string_decoder').StringDecoder;

const aws = require('aws-sdk');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const httpsOptions = {
    key: fs.readFileSync(__dirname + '/keys/key.pem'),
    cert: fs.readFileSync(__dirname + '/keys/cert.pem')
};

var ssl_port = process.env.EMAIL_PORT_SSL;
var port = process.env.EMAIL_PORT;


/**
 * Create HTTP server.
 */


const routes = {};

const server = http.createServer((req, res) => {
    processCall(req, res);
});

const ssl_server = https.createServer((req, res) => {
    processCall(req, res);
});


const areRequiredFieldsPresent = (objectToCheckIn, requirements) => {

    const results = []

    requirements.forEach(requirement => {
        const toCheck = objectToCheckIn[requirement.name];

        if (!toCheck) {
            return results.push(requirement.name);
        }

        if (requirement.type === 'array') {
            if (!Array.isArray(toCheck) || !toCheck.length > 0) {
                return results.push(requirement.name);
            }
        }
    });

    return results;
};

const processCall = (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    console.log('../: ',);

    aws.config.loadFromPath(__dirname + '/config.json');

    if (req.method !== 'POST') {
        res.writeHead(502);
        return res.end('Incorrect request type');
    }

    const decoder = new StringDecoder('utf-8');
    let buffer = '';

    const handler = parsedUrl.pathname === '/send' ? routes.email : (parsedUrl.pathname === '/sendEmailWithGmail' ? routes.sendEmailWithGmail : routes.sendTemplatedEmail);

    req.on('data', data => {
        buffer += decoder.write(data);
    });

    req.on('end', async () => {
        buffer += decoder.end();

        // now we have the buffer, let's parse it to get the object


        const emailData = JSON.parse(buffer);
        console.log('emailData: ', emailData);

        if (parsedUrl.pathname === '/send' || parsedUrl.pathname === '/sendEmailWithGmail') {
            /** normal email */
            const requirements = [{
                name: 'to',
                type: 'array'
            }, {
                name: 'subject',
                type: 'string'
            }, {
                name: 'html',
                type: 'string'
            }];


            const validationResults = areRequiredFieldsPresent(emailData, requirements);

            if (validationResults && validationResults.length > 0) {
                res.writeHead(500);
                return res.end('The passed object did not have required fields. Missing fields: ' + validationResults.join(', '));
            }
        }
        else if (parsedUrl.pathname === '/sendWithTemplate') {
            const requirements = [{
                name: 'to',
                type: 'array'
            }, {
                name: 'templateName',
                type: 'string'
            }, {
                name: 'templateData',
                type: 'array'
            }
            ];

            const validationResults = areRequiredFieldsPresent(emailData, requirements);

            if (validationResults && validationResults.length > 0) {
                res.writeHead(500);
                return res.end('The passed objects did not have required fields. Missing fields: ' + validationResults.join(', '));
            }
        }
        else {
            res.writeHead(400);
            return res.end('Not found on server');
        }
        console.log('wond');
        handler(emailData, (error, data) => {
            console.log('fond');
            if (error) {
                res.writeHead(502);
                return res.end(JSON.stringify(error));
            }
            else {
                res.writeHead(200);
                return res.end(JSON.stringify(data));
            }
        });
    });
};

routes.createTemplate = () => {
    var params = {
        Template: {
            TemplateName: 'error',
            HtmlPart: "<h1>Error Code: {{code}}</h1><p>Error Message: {{message}}</p>",
            SubjectPart: 'Error Found in {{source}}'
        }
    };


    const ses = new aws.SES({ apiVersion: '2010-12-01' });
    ses.createTemplate(params, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else console.log(data);           // successful response
    });
};


/**
 * 
 * @param {*} data 
 * @param {*} callback 
 * 
 * email functionality goes here
 */
routes.email = async (email, callback) => {
    console.log('aond: ', email);

    try {
        var params = {
            Destination: { /* required */
                CcAddresses: email.cc || [],
                ToAddresses: email.to
            },
            Message: {
                Body: {
                    Html: {
                        Charset: "UTF-8",
                        Data: email.html
                    },
                },
                Subject: {
                    Charset: 'UTF-8',
                    Data: email.subject
                }
            },
            Source: email.source || 'pragauttechnologies@gmail.com',
            ReplyToAddresses: email.replyTo || ['pragauttechnologies@gmail.com']
        };

        const sendPromise = new aws.SES({ apiVersion: '2010-12-01' }).sendEmail(params).promise();
        const result = await sendPromise;

        callback(undefined, result);
    }
    catch (error) {
        console.log('error: ', error);
        callback(error, undefined);
    }

};


routes.sendTemplatedEmail = async (email, callback) => {
    try {
        var params = {
            Destination: {
                CcAddresses: email.cc || [],
                ToAddresses: email.to
            },
            Template: email.templateName,
            TemplateData: JSON.stringify(email.templateData),
            Source: email.source || 'pragauttechnologies@gmail.com',
            ReplyToAddresses: email.replyTo || ['pragauttechnologies@gmail.com']
        };

        const sendPromise = new aws.SES({ apiVersion: '2010-12-01' }).sendTemplatedEmail(params).promise();
        const result = await sendPromise;

        callback(undefined, result);
    }
    catch (error) {
        console.log('error: ', error);
        callback(error, undefined);
    }

};

const SourceEmail = process.env.SourceEmail;
const EmailService = process.env.EmailService;
const Password = process.env.Password;

const transport = nodemailer.createTransport({
    service: EmailService,
    auth: {
        user: SourceEmail,
        pass: Password,
    },
});

/**
 * 
 * @param {*} data 
 * @param {*} callback 
 * 
 * email functionality goes here
 */
routes.sendEmailWithGmail = async (email, callback) => {
    console.log('aond: ', email);

    try {
        var params = {
            Destination: { /* required */
                CcAddresses: email.cc || [],
                ToAddresses: email.to
            },
            Message: {
                Body: {
                    Html: {
                        Charset: "UTF-8",
                        Data: email.html
                    },
                },
                Subject: {
                    Charset: 'UTF-8',
                    Data: email.subject
                }
            },
            Source: email.source || 'pragauttechnologies@gmail.com',
            ReplyToAddresses: email.replyTo || ['pragauttechnologies@gmail.com']
        };

        const mailOptions = {
            from: email.source || SourceEmail,
            to: email.to,
            cc: email.cc || [],
            subject: email.subject,
            html: email.html,
            replyTo: email.replyTo || SourceEmail,
            // attachments: [
            //     { // Use a URL as an attachment
            //         filename: 'your-testla.png',
            //         path: 'https://media.gettyimages.com/photos/view-of-tesla-model-s-in-barcelona-spain-on-september-10-2018-picture-id1032050330?s=2048x2048'
            //     }
            // ]
        };

        const result = await transport.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
            }
            else {
                console.log(info);
            }
        });

        callback(undefined, result);
    }
    catch (error) {
        console.log('error: ', error);
        callback(error, undefined);
    }

};


server.listen(port, () => {
    console.log('listening unsecured server @', port);
});

ssl_server.listen(ssl_port, () => {
    console.log('listening secured server @', ssl_port);
});