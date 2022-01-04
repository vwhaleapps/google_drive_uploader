const { finished } = require('stream');
const { promisify } = require('util');

const archiver = require('./libs/archiver');
const google = require('./libs/google');
const { logger } = require('./utils/logger');
const file = require('./libs/file');

const promisifiedFinished = promisify(finished);

async function main(id) {
  const defaultPath = file.getDefaultPath();
  file.createFoldersStructure(defaultPath);

  const archiveStream = archiver.getArchiver();
  const fileStream = file.getFileStream(`${defaultPath}/google-drive.zip`);

  fileStream.on('close', function () {
    logger.log(
     'Archiver has been finalized and the output file descriptor has closed.'
    );
  });

  archiveStream.on('error', function (err) {
    throw err;
  });
  archiveStream.pipe(fileStream);

  const googleResponse = await download(id, archiveStream);
  // 1 way stream and return buffer
  // const buffer = await downloadFromGDIntoBuffer(googleResponse.stream, archiveStream);
  // archiveStream.append(buffer, {
  //   name: googleResponse.details.name,
  // });

  // 2 way download array buffer and convert into buffer
  // const buffer = Buffer.from(googleBuffer,'utf-8')
  // archiveStream.append(buffer, {
  //   name: googleResponse.details.name,
  // });

  // 3 way how to download

  await archiveStream.finalize(function (err, bytes) {
    if (err) {
      throw err;
    }

    logger.log(`${bytes} total bytes`);
  });
}

async function isFolder(id) {
  const authClient = await google.authentication();
  const result = await google.isFolder(id, authClient);
  logger.log('This is folder: ', result);
  return result;
}

async function downloadFromGDIntoBuffer(googleStream) {
  let data = [];
  return new Promise((resolve, reject) => {
    googleStream
      .on('data', (chunk) => {
        data.push(chunk);
      })
      .on('error', (error) => reject(error))
      .on('end', () => {
        let buffer = Buffer.concat(data);
        resolve(buffer);
      });
  });
}

async function downloadFileAndArchive(fileId, archiverStream) {
  const file = await downloadFile(fileId);
  archiverStream.append(file.stream, { name: file.details.name });
  await promisifiedFinished(file.stream);

  return file;
}

async function downloadFile(fileId) {
  const authClient = await google.authentication();
  const file = await google.getObject(fileId, authClient);
  const stream = await google.downloadFile(file.id, file.mimeType, authClient);

  return { details: file, stream };
}

async function downloadFolderFiles(folderId, archiverStream, folderName = '') {
  const authClient = await google.authentication();
  const filesDownloads = [];
  logger.log(`Getting folder files (folderId: '${folderId}')`);
  const files = await google.getFolderFiles(folderId, authClient);
  logger.log(`Folder files count: ${files.length}`);
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    let name;
    if (await isFolder(file.id)) {
      name = file.name;
      const downloadedFiles = await downloadFolderFiles(file.id, archiverStream, `${folderName}/${name}`);
      filesDownloads.push(
        { name, files: await downloadedFiles }
      )
      continue;
    }

    const downloadedFile = await downloadFile(file.id);
    archiverStream.append(downloadedFile.stream, { name: `${folderName}/${downloadedFile.details.name}` })
    await promisifiedFinished(downloadedFile.stream)
    filesDownloads.push(downloadedFile);
  }

  return filesDownloads;
}

async function download(id, archiverStream) {
  const isFolderState = await isFolder(id);
  let result;
  if (isFolderState) {
    result = await downloadFolderFiles(id, archiverStream);
  }

  result = await downloadFileAndArchive(id, archiverStream);
  return result;
}

const getFileExtension = (file, defaultExtension ='txt') => {
  return file.fullFileExtension == undefined && file.fileExtension == undefined
    ?'doc'
    : file.fullFileExtension == file.fileExtension
    ? file.fullFileExtension
    : defaultExtension;
};

const getDownloadingFileFullName = (file) =>
  `${file.name}.${getFileExtension(file)}`;

const testFile = 'https://drive.google.com/file/d/1PCi2WSy-YH4sC_m5CasFlo7mos8Y6ExZ';
const mainTestFolder = 'https://drive.google.com/drive/folders/1DXEXDpw1ufK2LNmnxrz0-hFBYfHMoJNg';
const testFolderWithFiles = 'https://drive.google.com/drive/folders/1O2SrhuU_xENEE4mgjOLHBUfNyZ6-NwWv';
const testFolderWithFolders = 'https://drive.google.com/drive/folders/1CI5ileDqe1zAnMIYiX_LYk7SEcEQtF00';
const testFolderWithFoldersChains = 'https://drive.google.com/drive/folders/1b1KwBG5WrA16jqXaphdnbfr7Fa1KgMn2';

const getUrlId = (url) => {
  return url.split('/').reverse()[0];
};

Promise.resolve(main(getUrlId(testFile))).catch(console.error);
// Promise.resolve(main(getUrlId(mainTestFolder))).catch(console.error);
// Promise.resolve(main(getUrlId(testFolderWithFiles))).catch(console.error);
// Promise.resolve(main(getUrlId(testFolderWithFolders))).catch(console.error);
// Promise.resolve(main(getUrlId(testFolderWithFoldersChains))).catch(console.error);