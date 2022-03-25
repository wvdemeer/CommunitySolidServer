import type { HttpResponse } from '../../../server/HttpResponse';
import { MethodNotAllowedHttpError } from '../../../util/errors/MethodNotAllowedHttpError';
import { NotFoundHttpError } from '../../../util/errors/NotFoundHttpError';
import { UnsupportedMediaTypeHttpError } from '../../../util/errors/UnsupportedMediaTypeHttpError';
import { addHeader } from '../../../util/HeaderUtil';
import { isContainerPath } from '../../../util/PathUtil';
import { LDP, PIM, RDF, SOLID_ERROR } from '../../../util/Vocabularies';
import type { RepresentationMetadata } from '../../representation/RepresentationMetadata';
import { MetadataWriter } from './MetadataWriter';

/**
 * Generates Allow, Accept-Patch, Accept-Post, and Accept-Put headers.
 * The resulting values depend on the choses input methods and types.
 * The input metadata also gets used to remove methods from that list
 * if they are not valid in the given situation.
 */
export class AllowAcceptMetadataWriter extends MetadataWriter {
  private readonly supportedMethods: string[];
  private readonly acceptTypes: { patch: string[]; post: string[]; put: string[] };

  public constructor(supportedMethods: string[], acceptTypes: { patch?: string[]; post?: string[]; put?: string[] }) {
    super();
    this.supportedMethods = supportedMethods;
    this.acceptTypes = { patch: [], post: [], put: [], ...acceptTypes };
  }

  public async handle(input: { response: HttpResponse; metadata: RepresentationMetadata }): Promise<void> {
    const { response, metadata } = input;

    // We initially make the assumption that the target resource exists
    // as we can't know for sure for certain errors.
    const notAllowedMethods = new Set(metadata.getAll(SOLID_ERROR.terms.methodNotAllowed)
      .map((term): string => term.value));
    const supportedMethods = this.supportedMethods.filter((method): boolean => !notAllowedMethods.has(method));

    // We first work from the assumption that the target resource exists as we don't know in the case of a 415
    const allowedMethods = new Set<string>(supportedMethods);

    // This check only makes sense if we receive resource metadata with a valid identifier
    if (metadata.has(RDF.terms.type, LDP.terms.Resource) && !isContainerPath(metadata.identifier.value)) {
      allowedMethods.delete('POST');
    }

    if (!this.isDeleteAllowed(metadata)) {
      allowedMethods.delete('DELETE');
    }

    // Only add Allow headers for successful GET/HEAD requests, 404s, or 405s.
    // Otherwise we are not sure if the resource exists or not.
    const wasNotFound = metadata.has(RDF.terms.type, NotFoundHttpError.uri);
    const methodWasNotAllowed = metadata.has(RDF.terms.type, MethodNotAllowedHttpError.uri);
    const resourceExists = methodWasNotAllowed || metadata.has(RDF.terms.type, LDP.terms.Resource);
    const generateAllow = resourceExists || wasNotFound || methodWasNotAllowed;
    if (generateAllow) {
      // Only PUT and PATCH can be used to create a new resource
      if (!resourceExists) {
        allowedMethods.delete('GET');
        allowedMethods.delete('HEAD');
        allowedMethods.delete('OPTIONS');
        allowedMethods.delete('POST');
        allowedMethods.delete('DELETE');
      }

      addHeader(response, 'Allow', [ ...allowedMethods ].join(', '));
    }

    // Only add Accept-* headers if Allow headers are being added, or in case of a 415
    const typeWasUnsupported = metadata.has(RDF.terms.type, UnsupportedMediaTypeHttpError.uri);
    const generateAccept = generateAllow || typeWasUnsupported;
    if (generateAccept) {
      if (allowedMethods.has('PATCH')) {
        addHeader(response, 'Accept-Patch', this.acceptTypes.patch.join(', '));
      }
      if (allowedMethods.has('POST')) {
        addHeader(response, 'Accept-Post', this.acceptTypes.post.join(', '));
      }
      if (allowedMethods.has('PUT')) {
        addHeader(response, 'Accept-Put', this.acceptTypes.put.join(', '));
      }
    }
  }

  /**
   * DELETE is allowed if the target exists,
   * is not a container,
   * or if it is a container it is not a storage and empty.
   *
   * Note that the identifier value check only works if the metadata is not about an error.
   */
  private isDeleteAllowed(metadata: RepresentationMetadata): boolean {
    if (!isContainerPath(metadata.identifier.value)) {
      return true;
    }

    const isStorage = metadata.has(RDF.terms.type, PIM.terms.Storage);
    const isEmpty = metadata.has(LDP.terms.contains);
    return !isStorage && !isEmpty;
  }
}
