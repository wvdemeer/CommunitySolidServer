import type { Representation } from '../ldp/representation/Representation';
import type { ResourceIdentifier } from '../ldp/representation/ResourceIdentifier';
import { BadRequestHttpError } from '../util/errors/BadRequestHttpError';
import { NotFoundHttpError } from '../util/errors/NotFoundHttpError';
import { guardedStreamFrom, readableToString } from '../util/StreamUtil';
import { SHAPE } from '../util/Vocabularies';
import type { Conditions } from './Conditions';
import type { KeyValueStorage } from './keyvalue/KeyValueStorage';
import { PassthroughStore } from './PassthroughStore';
import type { ResourceStore } from './ResourceStore';

export class ShapeTreeStore extends PassthroughStore {
  private readonly shapeStorage: KeyValueStorage<string, string>;

  // Typings on storage might need to be different
  public constructor(source: ResourceStore, shapeStorage: KeyValueStorage<string, string>) {
    super(source);
    this.shapeStorage = shapeStorage;
  }

  // GET does not need a change afaik since the POST/PUT will store the correct metadata
  // which should be converted to a link header by a MetadataWriter

  // DELETE doesn't change

  // PATCH is something for later

  // POST
  public async addResource(container: ResourceIdentifier, representation: Representation,
    conditions?: Conditions): Promise<ResourceIdentifier> {
    // The issue is how to find out if the result should be a container or a document.
    // Best solution might be to extract the `isNewContainer` function from `DataAccessorBasedStore`
    // and put it in `ResourceUtil`.
    const isContainer = false;
    if (isContainer) {
      // From how I understand it nothing has to happen here since the metadata should already have been
      // added by a MetadataParser
    } else {
      // Validate the content
      const shapeId = representation.metadata.get(SHAPE.hasShape)?.value;
      if (!shapeId) {
        // This is a 400, we have errors for other status codes as well
        throw new BadRequestHttpError('Documents need to identify their shape.');
      }

      // I'm guessing we need to check if this shape is allowed in this container?
      // This means we need the container metadata.
      const containerRepresentation = await this.source.getRepresentation(container, {});
      // We don't need the data, only the metadata, so need to make sure to close the stream
      containerRepresentation.data.destroy();
      const containerShapes = containerRepresentation.metadata.getAll(SHAPE.supportsShapes);
      if (!containerShapes.some((term): boolean => term.value === shapeId)) {
        throw new BadRequestHttpError(`Shape is not supported in this container: ${shapeId}`);
      }

      const shapeTurtle = await this.shapeStorage.get(shapeId);
      if (!shapeTurtle) {
        throw new BadRequestHttpError(`No shape file found for ${shapeId}`);
      }
      // Reads the entire request into a string
      const data = await readableToString(representation.data);
      // Validate the data, throw errors if it fails
      // shapeTreeLibrary.doValidation(shapeTurtle, data);

      // At this point we need to make sure the representation object we pass along has a valid stream again
      representation.data = guardedStreamFrom(data);
    }
    return this.source.addResource(container, representation, conditions);
  }

  // PUT
  public async setRepresentation(identifier: ResourceIdentifier, representation: Representation,
    conditions?: Conditions): Promise<ResourceIdentifier[]> {
    // I'm not sure if for a PUT you need to check the link header (similar like the post)
    // or check the shape based on the metadata we already have stored.

    // In case it's the second:
    let storedRepresentation: Representation;
    try {
      storedRepresentation = await this.source.getRepresentation(identifier, {}, conditions);
    } catch (error: unknown) {
      // This is a hotfix so the server can start up properly
      // When starting, the server writes some metadata to the root container,
      // which might not exist yet and would cause an error at this point.
      // There's probably a cleaner way to handle this.
      if (NotFoundHttpError.isInstance(error)) {
        return this.source.setRepresentation(identifier, representation, conditions);
      }
      throw error;
    }
    // We don't need the data, only the metadata, so need to make sure to close the stream
    storedRepresentation.data.destroy();
    const shapeId = storedRepresentation.metadata.get(SHAPE.hasShape)?.value;

    // Do very similar stuff to the POST above

    return this.source.setRepresentation(identifier, representation, conditions);
  }
}
